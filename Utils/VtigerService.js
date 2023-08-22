const config = require("./config.json");
const axios = require("axios");
const https = require("https");

const UpdateSessionStatus = (token, sessionId) => {
    return new Promise((resole, reject) => {
        const responceObject = {
            statusCode: 0,
            message: "",
        };
        axios
            .post(config.CRM_ENDPOINT, {
                _operation: "saveRecord",
                _session: token,
                module: "Cases",
                values: {
                    session_status: "Abandoned",
                },
                record: sessionId,
            })
            .then((res) => {
                const response = res.data;
                if (response.success) {
                    responceObject.statusCode = 200;
                    responceObject.message = "status update";
                    resole(responceObject);
                } else if (response.error && response.error.message == "Login required") {
                    responceObject.statusCode = 400;
                    responceObject.message = "authentication failed";
                    reject(responceObject);
                } else {
                    responceObject.statusCode = 400;
                    responceObject.message = "failed";
                    reject(responceObject);
                }
            })
            .catch((error) => {
                responceObject.statusCode = 500;
                responceObject.message = error.message;
                reject(responceObject);
            });
    });
};

const SendMessage = (token, sessionId, userId, message) => {
    return new Promise((resole, reject) => {
        const responceObject = {
            statusCode: 0,
            message: "",
        };
        axios
            .post(config.CRM_ENDPOINT, {
                _operation: "createcommentfromchat",
                _session: token,
                message: message,
                userId: userId,
                sessionId: sessionId.split("x")[1],
            })
            .then((res) => {
                const response = res.data;
                if (response.success) {
                    responceObject.statusCode = 200;
                    responceObject.message = "success";
                    resole(responceObject);
                } else if (response.error && response.error.message == "Login required") {
                    responceObject.statusCode = 400;
                    responceObject.message = "authentication failed";
                    reject(responceObject);
                } else {
                    responceObject.statusCode = 400;
                    responceObject.message = "failed";
                    reject(responceObject);
                }
            })
            .catch((error) => {
                responceObject.statusCode = 500;
                responceObject.message = error.message;
                reject(responceObject);
            });
    });
};

module.exports = {
    UpdateSessionStatus,
    SendMessage
};
