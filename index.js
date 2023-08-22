require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const KJUR = require("jsrsasign");

const app = express();
const https = require("https").Server(app);
const port = process.env.PORT || 4000;
const Vtiger = require("./Utils/VtigerService");

app.use(bodyParser.json(), cors());
app.options("*", cors());

app.post("/", (req, res) => {
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

    res.json({
        signature: signature,
    });
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
    console.log(`⚡: ${socket.id} user just connected!`);

    socket.on("message", function (data) {
        console.log("Message received ", data);

        Vtiger.SendMessage(data.token, data.sessionId, data.userId, data.message).then((res) => {
            console.log(res);
            if (res.statusCode === 200) {
                socketIO.emit("message", data);
            }
        });
    });

    socket.on("zoomcall", function (data) {
        if (connectedProviders.map((ele) => ele.sessionId).includes(data.sessionId)) {
            console.log("updated", data.sessionId);
            let index = connectedProviders.findIndex((ele) => ele.sessionId == data.sessionId);
            connectedProviders.splice(index, 1, data);
        } else {
            console.log("pushed", data.sessionId);
            connectedProviders.push(data);
        }
    });

    function isWithin10Seconds(timestamp1, timestamp2) {
        const timeDifference = Math.abs(timestamp1 - timestamp2); // Calculate the absolute time difference in milliseconds
        const secondsDifference = timeDifference / 1000; // Convert milliseconds to seconds

        console.log(secondsDifference);
        return secondsDifference <= 30;
    }

    const heartbeatCheckInterval = setInterval(() => {
        console.log(connectedProviders);
        connectedProviders.forEach((zoom) => {
            const startTime = new Date(zoom.time).getTime(); // Replace with your timestamp in ISO 8601 format
            const endTime = new Date(new Date().toISOString()).getTime(); // Replace with your timestamp in ISO 8601 format

            const result = isWithin10Seconds(startTime, endTime);
            console.log(result, "startTime", new Date(zoom.time), "endTime", new Date());
            if (!result) {
                Vtiger.UpdateSessionStatus(zoom.token, zoom.sessionId)
                    .then((response) => console.log(response))
                    .catch((response) => console.log(response))
                    .finally(() => {
                        let index = connectedProviders.findIndex((ele) => ele.sessionId == zoom.sessionId);
                        connectedProviders.splice(index, 1);
                    });
                socketIO.emit("abandonedzoom", zoom);
                console.log(zoom.sessionId + "disconnect");
            }
        });
    }, 5000);

    socket.on("zoomend", (data) => {
        if (connectedProviders.map((ele) => ele.sessionId).includes(data.sessionId)) {
            let index = connectedProviders.findIndex((ele) => ele.sessionId == data.sessionId);
            connectedProviders.splice(index, 1);
        }
        clearInterval(heartbeatCheckInterval);
    });
});
