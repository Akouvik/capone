import express from "express";
import { json as parseJsonBody } from "body-parser";

import { register as registerMeasurements } from "./measurements/measurements-routes";
import { register as registerStats } from "./statistics/stats-routes";

const server = express();
const store = {};
// all requests and responses are in JSON
server.use(parseJsonBody());

// dummy handler so you can tell if the server is running
// features/01-measurements/03-update-measurement.feature
// e.g. `curl localhost:8000`
server.get("/", (req, res) => res.send("Weather tracker is up and running!\n"));

// when you hit the post endpoint, the server should get location in order to get the temp,dewpoint,ect...
server.post("/measurements", (req, res) => {
  //check that we have a date
  if (req.body.hasOwnProperty("timestamp")) {
    const { timestamp, ...rest } = req.body;
    for (const prop in rest) {
      //check if the inputs are all numbers
      if (typeof rest[prop] !== "number") {
        return res.status(400).end();
      }
    }
    //store the metrics
    store[timestamp] = req.body;
    //the Location header has the path "/measurements/2015-09-01T16:00:00.000Z"
    res.location(req.path + "/" + timestamp);
    return res.status(201).end();
  } else {
    return res.status(400).end();
  }
});

server.get("/measurements/:timestamp", (req, res) => {
  // console.log("params", req.params);

  const timestamp = req.params.timestamp;

  if (store.hasOwnProperty(timestamp)) {
    return res.status(200).send(store[timestamp]);
  } else {
    //fault tolerant responce
    const date = new Date();
    const messageTime = new Date(date).getTime();
    return res.status(404).send("time: " + messageTime);
  }
});

server.get("/stats?", (req, res) => {
  const query = req.query;
  let { fromDateTime, toDateTime, metric, stat } = query;
  //check if the metric in our query exists
  const checkrForMetricQuery = [];
  const queryingFor = {};
  // console.log("metric b4", metric);

  //the metrics we want to calculate for=> will later collect data for these metrics
  if (Array.isArray(metric)) {
    for (let i = 0; i < metric.length; i++) {
      queryingFor[metric[i]] = [];
    }
    // metric.forEach(element => (queryingFor[element] = []));
  } else {
    queryingFor[metric] = [];
    //set single metric to array so we can be able to scale if we later have multiple metrics
    metric = new Array(metric);
  }
  //get the inclusive and exclusive date time from the query
  //change the date to minutes for comparison
  fromDateTime = new Date(fromDateTime).getTime();
  toDateTime = new Date(toDateTime).getTime();

  //get all the dates we have in store
  const storeDateTimes = Object.keys(store);
  for (let i = 0; i < storeDateTimes.length; i++) {
    // console.log("storedatTime:", storeDateTimes[i]);

    //change the dates to minutes so we can compare to other dates
    const dateToTime = new Date(storeDateTimes[i]).getTime();
    if (
      dateToTime === fromDateTime ||
      (dateToTime > fromDateTime && dateToTime < toDateTime)
    ) {
      //
      for (const prop in store[storeDateTimes[i]]) {
        // console.log("prop:", prop, "val:", store[storeDateTimes[i]][prop]);
        checkrForMetricQuery.push(prop);
        if (queryingFor.hasOwnProperty(prop)) {
          queryingFor[prop].push(store[storeDateTimes[i]][prop]);
        }
      }
    }
  }

  // console.log("CULPRIT?", queryingFor, "checkr", checkrForMetricQuery);

  //if there is only one metric and its not in checkrForMetricQuery retrun []
  if (metric.length == 1 && !checkrForMetricQuery.includes(metric[0])) {
    return res.status(200).send([]);
  } else if (metric.length == 1 && checkrForMetricQuery.includes(metric[0])) {
    //call the stats function to get stats
    return stats();
  } else {
    for (let i = 0; i < metric.length; i++) {
      if (!checkrForMetricQuery.includes(metric[i])) {
        delete queryingFor[metric[i]];
      } else if (
        !checkrForMetricQuery.includes(metric[i]) &&
        i == metric.length - 1 &&
        Object.keys(queryingFor).length === 0
      ) {
        return res.status(200).send([]);
      } else {
        if (i == metric.length - 1 && Object.keys(queryingFor).length !== 0) {
          return stats();
        }
      }
    }
  }

  //function for calculating query stats
  function stats() {
    const responseArray = [];

    for (let entries in queryingFor) {
      let entryStat = {};

      for (let i = 0; i < stat.length; i++) {
        const responseBody = {};

        entryStat.max = parseFloat(
          Math.max(...queryingFor[entries]).toFixed(2)
        );
        entryStat.min = parseFloat(
          Math.min(...queryingFor[entries]).toFixed(2)
        );
        let sum = 0;
        for (let i = 0; i < queryingFor[entries].length; i++) {
          sum += queryingFor[entries][i];
        }
        // let sum = queryingFor[entries].reduce((acc, curr) => acc + curr);
        entryStat.average = parseFloat(
          (sum / queryingFor[entries].length).toFixed(2)
        );

        responseBody.metric = entries;
        responseBody.stat = stat[i];
        responseBody.value = entryStat[stat[i]];
        responseArray.push(responseBody);
      }
    }
    return res.status(200).send(responseArray);
  }
});
server.get("/review", (req, res) => {
  const result = [];
  let statResult = {};
  const callsMade = Object.values(store);

  statResult.numberOfEntries = callsMade.length;
  //collect the data for our metrics
  const resultObj = {};
  for (let i = 0; i < callsMade.length; i++) {
    for (const key in callsMade[i]) {
      if (resultObj.hasOwnProperty([key])) {
        resultObj[key].push(callsMade[i][key]);
      } else {
        resultObj[key] = [callsMade[i][key]];
      }
    }
  }

  //seperate the timestamp and date collected at those times
  let { timestamp, ...rest } = resultObj;

  //calculate the total hours of data collected
  let sumOfHours = 0;
  for (let i = 0; i < timestamp.length; i++) {
    sumOfHours += new Date(timestamp[i]).getHours();
  }
  statResult.totalHours = sumOfHours;
  console.log("dateTimeOfCalls", sumOfHours);

  //getting the total calculation for all our entries from beginning
  for (let key in rest) {
    const calc = {};
    calc.min = parseFloat(Math.min(...rest[key]).toFixed(2));
    calc.max = parseFloat(Math.max(...rest[key]).toFixed(2));
    let sum = 0;
    for (let i = 0; i < rest[key].length; i++) {
      sum += rest[key][i];
    }
    calc.average = parseFloat((sum / rest[key].length).toFixed(2));
    statResult[key] = calc;
  }
  result.push(statResult);

  //check if the intruments are reporting data
  let allMetric = 0;
  for (let key in result[0]) {
    allMetric += 1;
  }
  // console.log("allmetri", allMetric);

  if (allMetric == 2) {
    res.statusMessage = "Instruments are not collecting any data";
    res.status(400).send([]);
    // res.status(200).send("Instruments are not collecting any data");
  } else {
    res.status(200).send(result);
  }
});

registerMeasurements(server);
registerStats(server);

export default server;
