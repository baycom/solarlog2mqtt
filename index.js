var util=require('util');
var mqtt=require('mqtt');
var ModbusRTU = require("modbus-serial");
var Parser = require('binary-parser').Parser;
const commandLineArgs = require('command-line-args')
var errorCounter = 0;

const optionDefinitions = [
	{ name: 'mqtthost', alias: 'm', type: String, defaultValue: "localhost" },
	{ name: 'mqttclientid', alias: 'c', type: String, defaultValue: "slog1Client" },
	{ name: 'solarloghost', alias: 'i', type: String, defaultValue: "10.0.0.11"},
	{ name: 'solarlogport', alias: 'p', type: String, defaultValue: "502"},
        { name: 'address',      alias: 'a', type: Number, multiple:true, defaultValue: [1] },
        { name: 'wait',         alias: 'w', type: Number, defaultValue: 10000 },
        { name: 'debug',        alias: 'd', type: Boolean, defaultValue: false },
  ];

const options = commandLineArgs(optionDefinitions)

var SolarlogSerialNumber=[];
var modbusClient = new ModbusRTU();

modbusClient.setTimeout(1000);

if(options.solarloghost) {
	modbusClient.connectTCP(options.solarloghost, { port: parseInt(options.solarlogport),  debug: true }).catch((error) => {
		console.error(error);
		process.exit(-1);
	});
} else if(options.solarlogport) {
	modbusClient.connectRTUBuffered(options.solarlogport, { baudRate: 9600, parity: 'none' }).catch((error) => {
		console.error(error);
		process.exit(-1);
	});
}

console.log("MQTT Host         : " + options.mqtthost);
console.log("MQTT Client ID    : " + options.mqttclientid);
console.log("Solarlog MODBUS addr: " + options.address);

if(options.solarloghost) {
	console.log("Solarlog host       : " + options.solarloghost + ":" + options.solarlogport);
} else {
	console.log("Solarlog serial port: " + options.solarlogport);
}

var MQTTclient = mqtt.connect("mqtt://" + options.mqtthost,{clientId: options.mqttclientid});

MQTTclient.on("connect",function(){
	console.log("MQTT connected");
})

MQTTclient.on("error",function(error){
		console.log("Can't connect" + error);
		process.exit(1)
	});

function sendMqtt(id, data) {
        if(options.debug) {
	        console.log("publish: "+'Solarlog/' + id, JSON.stringify(data));
	}
        MQTTclient.publish('Solarlog/' + id, JSON.stringify(data));        
}

const SolarLogPayloadParser_3500 = new Parser()
	.array('lastUpdateTime', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}} ) //3500
	.array('Pac', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}} ) //3502
	.array('Pdc', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}} ) //3504
	.uint16be('Uac') //3506
	.uint16be('Udc') //3507
	.array('DailyYield', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3508
	.array('YesterdayYield', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3510
	.array('MonthlyYield', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3512
	.array('YearlyYield', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3514
	.array('TotalYield', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3516
	.array('PacConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3518
	.array('DailyYieldConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3520
	.array('YesterdayYieldConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3522
	.array('MonthlyYieldConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3524
	.array('YearlyYieldConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3526
	.array('TotalYieldConsumption', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3528
	.array('TotalPower', {type: "uint16be", length: 2, formatter: function(arr){return arr[1]<<16 | arr[0];}}) //3530
	;

const getSolarLogRegisters = async (address) => {
	try {
		modbusClient.setID(address);
		let data = await modbusClient.readInputRegisters(3500, 32);
		if(options.debug) {
			console.log(util.inspect(data));
		}
                let vals = SolarLogPayloadParser_3500.parse(data.buffer);
                
		if(options.debug) {
			console.log(util.inspect(vals));
		}
		sendMqtt(options.solarloghost, vals);
		errorCounter = 0;
	} catch (e) {
		if(options.debug) {
			console.log(e);
		}
		errorCounter++;
		return null;
	}
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getMetersValue = async (meters) => {
    try{
        var pos=0;
        // get value of all meters
        for(let meter of meters) {
                if(options.debug) {
                        console.log("query: " + meter);
                }
		await getSolarLogRegisters(meter);
		pos++;
        }
        if(errorCounter>30) {
        	console.log("too many errors - exiting");
        	process.exit(-1);
        }
	await sleep(options.wait);
    } catch(e){
        // if error, handle them here (it should not)
        console.log(e)
    } finally {
        // after get all data from salve repeate it again
        setImmediate(() => {
            getMetersValue(meters);
        })
    }
}

// start get value
getMetersValue(options.address);

