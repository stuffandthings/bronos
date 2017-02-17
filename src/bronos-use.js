require('babel-polyfill');
import _ from 'underscore';
import request from 'request';
import najax from 'najax';
import Utils from './utils';

var os = require('os');
var fs = require('fs');
var spawn = require('child_process').spawn;
var sonos = require('sonos');

process.on('uncaughtException', (err) => {
  fs.writeSync(1, `Caught exception: ${err}`);
});

function handleError (err) {
  console.error('ERROR: ' + err);
  exit();
}

function exit() {
  process.exit(1);
}

function sleep(timeout) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
}

const app = {
  run: async function() {
    await Utils.startSonosServer();
    var zones = [];

    try {
      zones = await this.getZones();
    } catch (e) {
      handleError(e);
    }
    console.log('zones: ' + zones.length);
    const zone = await this.chooseZone(zones);

    var config;
    try {
      config = await this.readConfig();
    } catch (e) {
      config = {};
    }

    await this.writeConfig({ ...config, zone });

    process.exit(1);
  },

  getZones: async function() {
    const promise = new Promise(function(resolve, reject) {
      const timeout = setTimeout(() => {
        reject('No Sonos devices found');
      }, 5000);

      najax.get('http://localhost:5005/zones')
        .success(function(response) {
          clearTimeout(timeout);
          const parsedResponse = JSON.parse(response);
          var zones = [];
          for (const entry of parsedResponse) {
            zones.push(entry.members[0]);
          }
          resolve(zones);
        })
        .error(function(error) {
          reject(error);
        });
    });

    return promise;
  },

  chooseZone: async function(zones) {
    var fzfInput = '';
    zones.forEach(function(zone, index) {
      fzfInput += `${index}: ${zone.roomName}\n`;
    });

    const result = await Utils.startFzf(fzfInput);
    const index = result.split(':')[0];
    const zone = zones[index];
    return zone;
  },

  readConfig: async function() {
    const promise = new Promise((resolve, reject) => {
      fs.readFile(`${os.homedir()}/.bronos`, (err, data) => {
        if (err) reject(err);

        if (data && data.length) {
          resolve(JSON.parse(data));
        } else {
          reject();
        }
      });
    });

    return promise;
  },

  writeConfig: async function(data) {
    const promise = new Promise(function(resolve, reject) {
      fs.writeFile(`${os.homedir()}/.bronos`, JSON.stringify(data), (err) => {
        if (err) handleError(err);
        resolve();
      });
    });

    return promise;
  }
};

app.run();
