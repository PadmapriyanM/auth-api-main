const config = require("./config.json");
const axios = require("axios");
const https = require("https");
const fs = require("fs");

// const agent = new https.Agent({ ca: fs.readFileSync(__dirname+"\\certificate.crt") });

// const axiosInstance = axios.create({
//     baseURL: config.CRM_ENDPOINT,
//     // httpsAgent: agent,
// });

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

module.exports = {
    UpdateSessionStatus,
};
