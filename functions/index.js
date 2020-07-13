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

//sign up sparring app with custom claims
exports.registerUser = functions.https.onCall(async (data, context) => {

    const email = data.email;
    const password = data.password;
    const displayName = data.displayName;
    const photoURL = data.photoURL;

    if (email == null || password == null || displayName == null) {
        throw new functions.https.HttpsError('signup-failed', 'missing information');
    }

    try {
        var userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
            photoURL: photoURL,
        });

        let customClaims;

        if(photoURL == 'https://i.ibb.co/2dbTY5C/person.png') {
            customClaims = {
                "https://hasura.io/jwt/claims": {
                    "x-hasura-default-role": "user",
                    "x-hasura-allowed-roles": ["user"],
                    "x-hasura-user-id": userRecord.uid
                }
            };
            
        } else if(photoURL == 'https://i.ibb.co/cYcKg83/ha.png') {
            customClaims = {
                "https://hasura.io/jwt/claims": {
                    "x-hasura-default-role": "admin",
                    "x-hasura-allowed-roles": ["admin", "user"],
                    "x-hasura-user-id": userRecord.uid
                }
            }
        } else {
            customClaims = {
                "https://hasura.io/jwt/claims": {
                    "x-hasura-default-role": "owner",
                    "x-hasura-allowed-roles": ["admin","user","owner"],
                    "x-hasura-user-id": userRecord.uid
                }
            };
            
        }

        await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);
        return userRecord.toJSON();

    } catch (e) {
        console.log(e);
        throw new functions.https.HttpsError('signup-failed', JSON.stringify(error, undefined, 2));
    }
});

// SYNC WITH HASURA ON USER CREATE
exports.processSignUp = functions.auth.user().onCreate(async user => {

    const id = user.uid;
    const email = user.email;
    const name = user.displayName || "No Name";
    const username = email.substring(0, email.lastIndexOf("@"));
    const photoURL = user.photoURL;

    let mutation;
    if(photoURL == 'https://i.ibb.co/2dbTY5C/person.png') {
        mutation = `mutation($id: String!, $email: String, $name: String, $username: String) {
            insert_users(objects: [{
                id: $id,
                email: $email,
                name: $name,
                username: $username,
            }]) {
                affected_rows
            }
        }`;
    } else if(photoURL == 'https://i.ibb.co/cYcKg83/ha.png') {
        mutation = `mutation($id: String!, $email: String, $name: String, $username: String) {
            insert_admin(objects: [{
                id: $id,
                email: $email,
                name: $name,
                username: $username,
            }]) {
                affected_rows
            }
        }`;
    } else {
        mutation = `mutation($id: String!, $email: String, $name: String, $username: String) {
            insert_owners(objects: [{
                id: $id,
                email: $email,
                name: $name,
                username: $username,
                owner_doc: {
                    data: {
                        info: "ok"
                    }
                }
            }]) {
                affected_rows
            }
        }`;
    }
    
    try {
        const data = await client.request(mutation, {
            id: id,
            email: email,
            name: name,
            username: username
        })

        return data;
    } catch (e) {
        throw new functions.https.HttpsError(e+'sync-failed');
    }
});

exports.processGoogleSignIn = functions.auth.user().onCreate(user => {
    const customClaims = {
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"],
        "x-hasura-user-id": user.uid
      }
    };
  
    return admin
      .auth()
      .setCustomUserClaims(user.uid, customClaims)
      .then(() => {
        // Update real-time database to notify client to force refresh.
        const metadataRef = admin.database().ref("metadata/" + user.uid);
        // Set the refresh time to the current UTC timestamp.
        // This will be captured on the client to force a token refresh.
        return metadataRef.set({ refreshTime: new Date().getTime() });
      })
      .catch(error => {
        console.log(error);
      });
  });

// SYNC WITH HASURA ON USER DELETE
exports.processDelete = functions.auth.user().onDelete(async (user) => {
    const mutation = `mutation($id: String!) {
        delete_users(where: {id: {_eq: $id}}) {
          affected_rows
        }
    }`;
    const id = user.uid;
    try {
        const data = await client.request(mutation, {
            id: id,
        })
        return data;
    } catch (e) {
        throw new functions.https.HttpsError('sync-failed');

    }
});