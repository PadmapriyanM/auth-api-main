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

ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

const ZOOM_OAUTH_ENDPOINT = "https://zoom.us/oauth/token";

app.use(bodyParser.json(), cors());
app.options("*", cors());

app.post("/zaktoken", async (req, res) => {
    try {
        const request = await axios.post(ZOOM_OAUTH_ENDPOINT, qs.stringify({ grant_type: "account_credentials", account_id: ZOOM_ACCOUNT_ID }), {
            headers: {
                Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64")}`,
            },
        });

        const response = await request.data;
        response.userId = req.body.userId;
        generateZAKToken(response, res);
    } catch (e) {
        console.error(e?.message, e?.response?.data);
        res.status(500).send({ error: JSON.stringify(e) });
    }
});

const generateZAKToken = async (data, res) => {
    const access_token = data.access_token;
    const userId = data.userId;
    try {
        const request = await axios.get(`https://api.zoom.us/v2/users/${userId}/token?type=zak`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        const response = await request.data;
        response.result = "success";
        response.signature = data.signature;
        res.send(response);
    } catch (e) {
        console.error(e?.message, e?.response?.data);
    }
};

app.post("/", async (req, res) => {
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
        const request = await axios.post(ZOOM_OAUTH_ENDPOINT, qs.stringify({ grant_type: "account_credentials", account_id: ZOOM_ACCOUNT_ID }), {
            headers: {
                Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64")}`,
            },
        });

        const response = await request.data;
        response.userId = req.body.userId;
        response.signature = signature;
        generateZAKToken(response, res);
    } else {
        res.json({
            signature: signature,
        });
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

socketIO.on("connection", (socket) => {
    // console.log(`⚡: ${socket.id} user just connected!`);

    console.log("user id", socket.handshake.auth);

    const userId = socket.handshake?.auth?.userId;

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
        // socket is disconnected
        console.log("user disconnect", userId);
        
        let isSessionExits = connectedProviders.findIndex((ele) => ele.userId == userId);

        console.log("isSessionExits", isSessionExits > -1 ? "true" : "false");
        if (isSessionExits > -1) {
            const session = connectedProviders[isSessionExits];
            console.log("abandoned", session);

            Vtiger.UpdateSessionStatus(session.token, session.sessionId, session.env)
                .then((response) => console.log(response))
                .catch((response) => console.log(response))
                .finally(() => {
                    let filterData = connectedProviders.filter((ele) => ele.sessionId != session.sessionId);
                    connectedProviders = [...filterData];
                });
            socketIO.emit("abandonedzoom", session);
            console.log(session.sessionId + "disconnect");
        }
    });
});
