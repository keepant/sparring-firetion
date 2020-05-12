const functions = require("firebase-functions");
const admin = require("firebase-admin");
const request = require("graphql-request");

const client = new request.GraphQLClient('https://sparring-api.herokuapp.com/v1/graphql', {
    headers: {
        "content-type": "application/json",
        "x-hasura-admin-secret": "IIRR267Janrexzonme" 
    }
})
admin.initializeApp(functions.config().firebase);