require('babel-polyfill');

import assert from 'assert';
import axios from 'axios';
import emberMetal from 'ember-metal';
import emberRuntime from 'ember-runtime';
import path from 'path';
import { fork } from 'child_process';

import Utils from '~/utils';
import AppPreferences from '~/app-preferences';

export default Ember.Object.extend({
  roomName: function() {
    throw new Error('Zone requires a roomName');
  }.property(),

  // base url for most actions
  baseURL: function() {
    const roomName = this.get('roomName');
    return `http://localhost:5005/${roomName}/`;
  }.property('roomName'),

  // TODO: override axios url to encodeURI
  axios: function() {
    const baseURL = this.get('baseURL');
    const axiosInstance = axios.create({ baseURL });
    return axiosInstance;
  }.property('baseURL'),

  // getter actions
  async fetch() {
    const roomName = this.get('roomName');
    const url = `http://localhost:5005/zones`;
    const response = await axios.get(url);
    let zone;

    outerloop:
    for (let group of response.data) {
      for (let member of group.members) {
        if (member.roomName === roomName) {
          zone = member;
          break outerloop;
        }
      }
    }

    this.setProperties(zone);
    return this;
  },

  getQueue: async function() {
    const axios = this.get('axios');
    const response = await axios.get('/queue');
    return response.data;
  },

  // setter actions
  playTrack(trackId) {
    return this.get('axios').get(`/spotify/now/spotify:track:${trackId}`);
  },

  playTrackNext(trackId) {
    return this.get('axios').get(`/spotify/next/spotify:track:${trackId}`);
  },

  next() {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/next`);
    return axios.get(url);
  },

  previous: async function() {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/previous`);
    return axios.get(url);
  },

  play: async function() {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/play`);
    return axios.get(url);
  },

  pause: async function() {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/pause`);
    return axios.get(url);
  },

  clearQueue: async function() {
    const axios = this.get('axios');
    const response = await axios.get('/clearqueue');
    return response.data;
  },

  say: async function(message) {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/say/${message}`);
    this.backgroundMethod('axiosGet', url);
  },

  setVolume: async function(volume) {
    const axios = this.get('axios');
    const roomName = this.get('roomName');
    const url = encodeURI(`http://localhost:5005/${roomName}/volume/${volume}`);
    this.backgroundMethod('axiosGet', url);
  },

  axiosGet(url) {
    return this.get('axios').get(url);
  },

  queueTrack: async function(zoneName, trackId, index) {
    // Sonos API is indexed at 1, that's no fun
    index++;

    // TODO: use axios transformResponse config to transform this response
    const promise = new Promise(function(resolve, reject) {

      const baseURL = `http://localhost:5005/${zoneName}/spotify/queue/spotify:track:${trackId}`;
      const indexParam = index ? `/${index}` : '';
      const url = encodeURI(`${baseURL}${indexParam}`);

      axios.get(url, function() {
        resolve();
      });
    });

    return promise;
  },

  addTracks: async function(trackIds, action = 'queue', index = 0) {
    const axios = this.get('axios');
    let response;

    if (trackIds.length > 1) {
      const baseEndpoint = `/spotifymulti/${action}/${index}/`;
      const trackURIs = trackIds.map(trackId => `spotify:track:${trackId}`);
      const trackURIsJoined = trackURIs.join('/');
      response = await axios.get(`${baseEndpoint}${trackURIsJoined}`);
    } else {
      const trackURI = `spotify:track:${trackIds[0]}`;
      response = await axios.get(`/spotify/${action}/${trackURI}/${index}`);
    }

    return response.data;
  },

  // TODO: extract this into base model
  backgroundMethod(methodName, ...args) {
    const modelName = 'zone';
    const scriptPath = path.normalize(`${__dirname}/background.js`);
    const child = fork(scriptPath);
    const data = this.serialize();

    child.send({ modelName, methodName, args, data });
    child.disconnect();
    process.exit();
  },

  serialize() {
    return this.getProperties('roomName', 'state');
  },
}).reopenClass({
  preferencesNamespace: 'models/zone',

  getPreferences() {
    const preferencesNamespace = this.preferencesNamespace;
    AppPreferences[preferencesNamespace] = AppPreferences[preferencesNamespace] || {};
    return AppPreferences[preferencesNamespace];
  },

  async getDefaultZone({ immediate=false, serialize=false }={}) {
    const preferences = this.getPreferences();
    if (!preferences.defaultZone) return;

    const zone = this.create(preferences.defaultZone);
    if (!immediate) await zone.fetch();
    return serialize ? zone.serialize() : zone;
  },

  setDefaultZone(zone) {
    const preferences = this.getPreferences();
    preferences.defaultZone = zone.serialize();
  },
});
