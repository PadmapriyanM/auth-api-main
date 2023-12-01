require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const KJUR = require("jsrsasign");
const qs = require("query-string");

const app = express();
const https = require("https").Server(app);
const port = process.env.PORT || 4000;
const Vtiger = require("./Utils/VtigerService");
const axios = require("axios");
const requestIp = require("request-ip");

ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

const ZOOM_OAUTH_ENDPOINT = "https://zoom.us/oauth/token";

app.use(bodyParser.json(), cors());
app.options("*", cors());

const AccessToken = async () => {
    const request = await axios.post(ZOOM_OAUTH_ENDPOINT, qs.stringify({ grant_type: "account_credentials", account_id: ZOOM_ACCOUNT_ID }), {
        headers: {
            Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64")}`,
        },
    });
    const data = await request.data;
    return data;
};

/**
 * The function `ZoomApi` is an asynchronous function that makes API requests to the Zoom API using the
 * provided URL, method, body data, and parameters data.
 * @param {string} url - The `url` parameter is the endpoint of the Zoom API that you want to call. For example,
 * if you want to get a list of users, the `url` parameter would be "users".
 * @param {string} Method - The `Method` parameter is the HTTP method to be used for the API request, such as
 * "GET", "POST", "PUT", "DELETE", etc.
 * @param {Object} bodyData - The `bodyData` parameter is used to pass data in the request body. It is an
 * optional parameter, so you can omit it if you don't need to send any data in the request body.
 * @param {Object} paramsData - The `paramsData` parameter is an object that contains any query parameters that
 * need to be included in the API request. These parameters are typically used to filter or sort the
 * data returned by the API.
 * @returns The function `ZoomApi` returns a promise that resolves to the response object from the API
 * request.
 */
const ZoomApi = async (url, Method, bodyData, paramsData) => {
    const URL = "https://api.zoom.us/v2/" + url;

    const ZoomAuth = await AccessToken();

    let headerComponent = {
        method: Method,
        url: URL,
        headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
            Connection: "keep-alive",
            Authorization: `Bearer ${ZoomAuth.access_token}`,
        },
    };
    if (bodyData) {
        headerComponent.data = bodyData;
    }
    if (paramsData) {
        headerComponent.params = paramsData;
    }

    const request = await axios(headerComponent);

    const response = await request;

    return response;
};

const generateZAKToken = async (data) => {
    const userId = data.userId;

    const request = await ZoomApi(`users/${userId}/token`, "GET", null, { type: "zak" });

    const response = await request.data;
    response.result = "success";
    response.signature = data.signature;
    return response;
};

const getMeetingDetails = async (data) => {
    const meetingId = data.meetingId;

    const request = await ZoomApi(`past_meetings/${meetingId}`, "GET", null, null);

    const response = await request.data;
    response.result = "success";

    return response;
};

const EndZoomMeeting = async (meetingId) => {
    if (!meetingId) {
        throw new Error("Meeting Id cannot be empty");
    }

    const request = await ZoomApi(
        `meetings/${meetingId}/status`,
        "PUT",
        {
            action: "end",
        },
        null
    );

    const response = await request.data;

    response.result = "success";

    return response;
};

app.post("/", async (req, res) => {
    try {
        const iat = Math.round(new Date().getTime() / 1000) - 30;
        const exp = iat + 60 * 60 * 2;

        const oHeader = { alg: "HS256", typ: "JWT" };

        const oPayload = {
            sdkKey: process.env.ZOOM_MEETING_SDK_KEY,
            mn: req.body.meetingNumber,
            role: req.body.role,
            iat: iat,
            exp: exp,
            appKey: process.env.ZOOM_MEETING_SDK_KEY,
            tokenExp: iat + 60 * 60 * 2,
        };

        const sHeader = JSON.stringify(oHeader);
        const sPayload = JSON.stringify(oPayload);
        const signature = KJUR.jws.JWS.sign("HS256", sHeader, sPayload, process.env.ZOOM_MEETING_SDK_SECRET);
        if (typeof req.body?.userId == "string" && req.body?.userId.length > 0) {
            const Data = {
                userId: req.body.userId,
                signature: signature,
            };
            const response = await generateZAKToken(Data, res);
            res.send(response);
        } else {
            res.json({
                signature: signature,
            });
        }
    } catch (e) {
        res.status(500).send({ error: e });
    }
});

app.post("/meetingdetails", async (req, res) => {
    try {
        if (typeof req.body?.meetingId == "string" && req.body?.meetingId.length > 0) {
            const Data = {
                meetingId: req.body.meetingId,
            };
            const response = await getMeetingDetails(Data);
            res.send(response);
        } else {
            res.status(404).send({
                error: "meeting id missing",
            });
        }
    } catch (e) {
        res.status(500).send({ error: e });
    }
});

app.put("/endmetting", async (req, res) => {
    try {
        if (typeof req.body?.meetingId == "string" && req.body?.meetingId.length > 0) {
            const response = await EndZoomMeeting(req.body.meetingId);
            res.send(response);
        } else {
            res.status(404).send({
                error: "meeting id missing",
            });
        }
    } catch (e) {
        console.log(e.message);
        res.status(500).send({ error: e });
    }
});

app.get("/getloc", async (req, res) => {
    try {
        const Ip = requestIp.getClientIp(req);
        res.status(200).send({ Ipaddress: Ip });
    } catch (e) {
        res.status(500).send({ error: e });
    }
});

const ingredients = [
    {
        id: "1",
        item: "Bacon",
    },
    {
        id: "2",
        item: "Eggs",
    },
    {
        id: "3",
        item: "Milk",
    },
    {
        id: "4",
        item: "Butter",
    },
];

app.get("/test", (req, res) => {
    console.log(req.socket.remoteAddress);
    res.send(ingredients);
});

const server = app.listen(port, () => console.log(`Zoom Meeting SDK Auth Endpoint Sample Node.js listening on port ${port}!`));

const socketIO = require("socket.io")(https, {
    cors: {
        origin: "*",
    },
});

socketIO.listen(server);

let connectedProviders = [];

let ActiveUsers = [];

socketIO.on("connection", (socket) => {
    // console.log(`⚡: ${socket.id} user just connected!`);

    console.log("user id", socket.handshake?.auth?.userId);

    const userId = socket.handshake?.auth?.userId;

    if (userId) {
        ActiveUsers.push(userId);
    }

    socket.on("message", function (data) {
        console.log("Message received ", data);

        Vtiger.SendMessage(data.token, data.sessionId, data.userId, data.message, data.env)
            .then((res) => {
                console.log(res);
                if (res.statusCode === 200) {
                    socketIO.emit("message", data);
                }
            })
            .catch((e) => {
                console.log(e);
            });
    });

    socket.on("vtigerMessage", function (data) {
        socketIO.emit("vtigerMessage", data);
    });

    socket.on("zoomcall", function (data) {
        let isSessionExits = connectedProviders.findIndex((ele) => ele.sessionId == data.sessionId && ele.role == data.role);
        if (isSessionExits > -1) {
            console.log("updated", data);
            let index = isSessionExits;

            connectedProviders.splice(index, 1, data);
        } else {
            console.log("pushed", data);
            connectedProviders.push(data);
        }
    });

    socket.on("zoomendall", function (data) {
        if (data.sessionId) {
            let filterData = connectedProviders.filter((ele) => ele.sessionId != data.sessionId);
            connectedProviders = [...filterData];
        }
    });

    socket.on("zoomend", (data) => {
        let isSessionExits = connectedProviders.findIndex((ele) => ele.sessionId == data.sessionId && ele.role == data.role);
        console.log("zoom end", isSessionExits > -1 ? "true" : "false");
        if (isSessionExits > -1) {
            let index = isSessionExits;
            console.log(connectedProviders[index], "connectedProviders");
            connectedProviders.splice(index, 1);

            socketIO.emit("zoomendsuccess", data);
        }
    });

    socket.on("disconnect", async function (data) {
        try {
            // socket is disconnected
            console.log("user disconnect", userId);
            let index = ActiveUsers.indexOf(userId);
            if (index !== -1) {
                ActiveUsers.splice(index, 1);
            }
            let localConnectedProviders = [...connectedProviders];
            setTimeout(async () => {
                let index = ActiveUsers.indexOf(userId);
                if (index == -1) {
                    console.log("session InActive");

                    let isSessionExits = localConnectedProviders.findIndex((ele) => ele.userId == userId);

                    console.log("isSessionExits", isSessionExits > -1 ? "true" : "false");
                    if (isSessionExits > -1) {
                        const session = localConnectedProviders[isSessionExits];
                        console.log("abandoned", session);

                        const SessionUpdate = Vtiger.UpdateSessionStatus(session.token, session.sessionId, session.env);

                        const EndZoom = EndZoomMeeting(session?.meetingId);

                        socketIO.emit("abandonedzoom", session);

                        await Promise.allSettled([SessionUpdate, EndZoom]);

                        let filterData = localConnectedProviders.filter((ele) => ele.sessionId != session.sessionId);

                        localConnectedProviders = [...filterData];

                        console.log(session.sessionId + "disconnect");
                    }
                }
            }, 60000);
        } catch (e) {
            console.log("Error", e);
        }
    });
});
