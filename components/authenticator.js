const request = require('request');
const uuid = require('uuid/v1');
const api_url = "https://authserver.mojang.com";


function getAuth(username, password) {
    return new Promise(resolve => {
        if(!password) {
            const user = {
                access_token: uuid(),
                client_token: uuid(),
                uuid: uuid(),
                name: username,
                user_object: JSON.stringify({})
            };

            resolve(user);
            return;
        }

        const requestObject = {
            url: api_url + "/authenticate",
            json: {
                agent: {
                    name: "Minecraft",
                    version: 1
                },
                username: username,
                password: password,
                requestUser: true
            }
        };

        request.post(requestObject, function(error, response, body) {
            if (error) resolve(error);
            if(!body.selectedProfile) {
                throw new Error("Validation error: " + response.statusMessage);
            }

            const userProfile = {
                access_token: body.accessToken,
                client_token: uuid(),
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                selected_profile: body.selectedProfile,
                user_properties: JSON.stringify((body.user || {}).properties || {})
            };

            resolve(userProfile);
        });
    });
}

function validate(access_token) {
    return new Promise(resolve => {
        const requestObject = {
            url: api_url + "/validate",
            json: {
                "accessToken": access_token
            }
        };

        request.post(requestObject, async function(error, response, body) {
            if (error) resolve(error);

            if(!body) resolve(true); else resolve(false);
        });
    });
}

function refreshAuth(accessToken, clientToken, selectedProfile) {
    return new Promise(resolve => {
        const requestObject = {
            url: api_url + "/refresh",
            json: {
                "accessToken": accessToken,
                "clientToken": clientToken,
                "selectedProfile": selectedProfile,
                "requestUser": true
            }
        };

        request.post(requestObject, function(error, response, body) {
            if (error) resolve(error);
            console.log(body);
            if(!body.selectedProfile) {
                throw new Error("Validation error: " + response.statusMessage);
            }

            const userProfile = {
                access_token: body.accessToken,
                client_token: uuid(),
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                user_properties: JSON.stringify((body.user || {}).properties || {})
            };

            resolve(userProfile);
        });
    });
}

module.exports = {getAuth, validate, refreshAuth};