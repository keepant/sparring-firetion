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

//sign uo with custom claims
exports.registerUser = functions.https.onCall(async (data, context) => {

    const email = data.email;
    const password = data.password;
    const displayName = data.displayName;

    if (email == null || password == null || displayName == null) {
        throw new functions.https.HttpsError('signup-failed', 'missing information');
    }

    try {
        var userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName
        });

        const customClaims = {
            "https://hasura.io/jwt/claims": {
                "x-hasura-default-role": "user",
                "x-hasura-allowed-roles": ["user"],
                "x-hasura-user-id": userRecord.uid
            }
        };

        await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);
        return userRecord.toJSON();

    } catch (e) {
        throw new functions.https.HttpsError('signup-failed', JSON.stringify(error, undefined, 2));
    }
});

// SYNC WITH HASURA ON USER CREATE
exports.processSignUp = functions.auth.user().onCreate(async user => {

    const id = user.uid;
    const email = user.email;
    const name = user.displayName || "No Name";
    const username = email.substring(0, email.lastIndexOf("@"));

    const mutation = `mutation($id: String!, $email: String, $name: String, $username: String) {
    insert_users(objects: [{
        id: $id,
        email: $email,
        name: $name,
        username: $username,
      }]) {
        affected_rows
      }
    }`;
    try {
        const data = await client.request(mutation, {
            id: id,
            email: email,
            name: name,
            username: username
        })

        return data;
    } catch (e) {
        throw new functions.https.HttpsError('sync-failed');
    }
});