'use strict';

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const jsonParser = bodyParser.json();
const app = express();
const axios = require("axios");
const cors = require("cors");

const TRIPADVISOR_API_KEY = process.env.TRIPADVISOR_API_KEY;
const WHITE_LIST = ["https://viator-done-right.et.r.appspot.com", "http://localhost:5000"];
const corsOptions = {
  origin: (origin, callback) => {
    if (origin === undefined || WHITE_LIST.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Origin \'' + origin + '\' not allowed by CORS'));
    }
  }
}

app.options("/*", (req, res, next) => {
  var origin = req.get("origin");
  if (origin) {
    if (WHITE_LIST.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);

      res.set("Access-Control-Allow-Methods", "GET, POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      res.status(204).send("");
      return;
    }
  }
});

app.post("/viator/suggest", jsonParser, cors(corsOptions), (req, res, next) => {
  let data = req.body;
  const config = {
    method: "POST",
    url: "https://supplier.viator.com/location/suggest",
    data: data,
    headers: {
      "Content-Type": "application/json;charset=utf-8", "Origin": "https://supplier.viator.com", "Referrer": "https://supplier.viator.com/product/9574P632", "Host": "supplier.viator.com"
    }
  };

  axios(config)
    .then((response) => {
      res.json(response.data);
    }, (error) => {
      next(error);
    });
});

async function findLocation(locationId) {
  return axios.get("http://api.tripadvisor.com/api/partner/2.0/location/" + locationId + "?key=" + TRIPADVISOR_API_KEY).then((resp) => {
    let data = resp.data;
    if (data.latitude != "0.0" && data.longitude != "0.0") {
      return { lat: data.latitude, lng: data.longitude };
    } else if (data.ancestors) {
      let location = null;
      data.ancestors.find((ancestor) => {
        location = findLocation(ancestor.location_id);
        return location;
      });
      return location;
    } else {
      return null;
    }
  });
}

app.post("/viator/details", jsonParser, cors(corsOptions), (req, res, next) => {
  let data = req.body;
  axios.get("https://supplier.viator.com/location/detail/" + data.providerReference + "?language=en&bypassCache=false")
    .then(async (resp1) => {
      if (resp1.data.tripAdvisorUrl) {
        let result = { "url": resp1.data.tripAdvisorUrl };
        if (resp1.data.centre) {
          result.location = { lat: resp1.data.centre.lat, lng: resp1.data.centre.long };
          res.json(result);
        } else if (resp1.data.tripAdvisorLocationId) {
          let location = await findLocation(resp1.data.tripAdvisorLocationId);
          if (location) {
            result.location = location;
          }
          res.json(result);
        } else {
          res.json(result);
        }
      } else if (resp1.data.centre) {
        let location = resp1.data.centre;
        axios.get("http://api.tripadvisor.com/api/partner/2.0/location_mapper/" + location.lat + "," + location.long + "?key=" + TRIPADVISOR_API_KEY + "-mapper&category=attractions")
          .then((resp2) => {
            axios.get("http://api.tripadvisor.com/api/partner/2.0/location/" + resp2.data.data[0].location_id + "?key=" + TRIPADVISOR_API_KEY)
              .then((response3) => {
                let result = { "url": response3.data.web_url };
                result.location = { lat: resp1.data.centre.lat, lng: resp1.data.centre.long };
                res.json(result);
              }, (error) => {
                next(error);
              })
          }, (error) => {
            next(error);
          });
      } else {
        throw new Error("No valid location found for provider reference '" + data.providerReference + "':\n\n" + resp1.data);
      }
    }, (error) => {
      next(error);
    });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

module.exports = app;