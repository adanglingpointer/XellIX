// ------------ //
/* = Requires = */
// ------------ //

const axios = require("axios");
const { exec, execSync } = require("child_process");
const { promisify } = require("util");
const express = require("express");
const bodyParser = require("body-parser");
const { stdout, stderr } = require("process");
const app = express();

const fs = require("fs");
const path = require("path");
const { json } = require("body-parser");

const { Client } = require("ssh2");

// ------------------------ //
/* = Setup Express Server = */
// ------------------------ //

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(function (req, res, next) {
  res.header("Content-Type", "application/json;charset=UTF-8");
  res.header("Access-Control-Allow-Credentials", true);

  if (req.headers.origin === "https://xellix.unlimitedweb.space") {
    res.header(
      "Access-Control-Allow-Origin",
      "https://xellix.unlimitedweb.space"
    );
  } else {
     res.header("Access-Control-Allow-Origin", "*");
  }
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// ------------------------- //
/* = GET route for scanner = */
// ------------------------- //

app.get("/*", async (request, response) => {
  const requestData = request.params[0].toString();
  console.log("we received a request: \n" + requestData);
  console.log("from: " + request.ip);
  if (requestData == "favicon.ico") {
    response.send(" ");
    return;
  }
  let sanitizeRegex = new RegExp(
    `[{};'"?\>\<\~\`!@#$%^&\*()_=\+\\s\\]\\[\|:]+`
  );
  if (sanitizeRegex.test(requestData)) {
    response.send({ error: "error" });
    return;
  }
  let endAtSlashRegex = new RegExp(`[\\/\]+`);
  if (endAtSlashRegex.test(requestData)) {
    response.send({ error: "error" });
    return;
  }
  const keyRegex = new RegExp(`[\\s\\\\/\\:\\|"]`);
  if (keyRegex.test(requestData)) {
    response.send({ error: "error" });
    return;
  }

  let lookupDomain = requestData.toLowerCase();

  const path = `scans/${lookupDomain}`;

  // Check if file exists
  fs.access(path, fs.constants.F_OK, async (err) => {
    if (err) {
      //console.log("File does not exist. Creating file...");
      let sendResponse = await scanDomain(lookupDomain);
      response.send(sendResponse);
      fs.writeFile(path, JSON.stringify(sendResponse), (err) => {
        if (err) throw err;
        //console.log("File saved!");
      });
    } else {
      //console.log("File exists. Reading file...");
      fs.readFile(path, "utf8", (err, data) => {
        if (err) throw err;
        //console.log("File contents:", data);
        response.send(data);
      });
    }
  });
  // }
});

// ---------------------------- //
/* = POST route for installer = */
// ---------------------------- //

var newUser = "";
var newPass = "";
var targetHost = "";
var targetPass = "";

var installParams = "";

app.post("/install", async (req, res) => {
  console.log("req.body is " + req.body);
  console.log("req.body.chosenOs is " + req.body.chosenOs);

  newUser = req.body.newuser;
  newPass = req.body.userpass;
  targetHost = req.body.target;
  targetPass = req.body.password;
  var aptChoice = "";
  var fireFox = "";
  if (req.body.chosenOs === "ubuntu2004") {
    aptChoice = "kubuntu-desktop";
    fireFox = "firefox-esr";
  }
  if (req.body.chosenOs === "ubuntu2204") {
    aptChoice = "kubuntu-desktop";
    fireFox = "firefox";
  }
  if (req.body.chosenOs === "debian11") {
    aptChoice = "kde-plasma-desktop";
    fireFox = "firefox-esr";
  }
  if (req.body.chosenOs === "debian12") {
    aptChoice = "kde-plasma-desktop";
    fireFox = "firefox-esr";
  }

  console.log("aptChoice is " + aptChoice);

  if (aptChoice == null || aptChoice == "" || !aptChoice) {
    res.write("error");
    return 0;
  }

  installParams = `useradd -m -p $(openssl passwd -1 '${newPass}') ${newUser}; usermod -aG sudo ${newUser}; apt update; apt install ${aptChoice} -y; apt install xrdp -y; apt install ${fireFox} -y;`;

  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Transfer-Encoding": "chunked",
  });

  let Client = require("ssh2").Client;

  let ssh = new Client();

  ssh.connect({
    host: targetHost,
    port: 22,
    username: "root",
    password: targetPass,
   // localPort: 443
  });

  ssh.on("ready", () => {
    ssh.exec(
      installParams,
      (err, stream) => {
        if (err) {
          res.write(`SSH exec error: ${err}\n`);
          res.end();
        } else {
          stream.on("data", (data) => {
            let output = data.toString();
            console.log(output);
            res.write(output);

            if (
              output.includes("Waiting for cache lock") ||
              output.includes("Could not get lock")
            ) {
              res.end();
              ssh.destroy();
              console.log("we made it into cache lock");
            }

            let cacheLockRegex1 = new RegExp(/[Ww]aiting for cache lock/);

            if (cacheLockRegex1.test(output)) {
              res.end();
              ssh.destroy();
              console.log("we made it into cache lock");
            }
          });

          stream.on("close", (code, signal) => {
            res.write("The XellIX installer has finished!");
            res.end();
            ssh.destroy();
          });
        }
      }
    );
  });

  ssh.on("error", (err) => {
    res.write(
      "SSH connection error:  Password authentication failed, host refused, or host is down"
    );
    res.end();
    ssh.destroy();
  });
});

app.listen(process.env.PORT || 3031, () => {
  console.log("Server started on port 3031");
});

/////

// Clear cached lookups
function deleteOldFiles() {
  const currentTime = Date.now();

  dirName = "scans";

  const dirContents = fs.readdirSync(dirName);

  for (const fileName of dirContents) {
    const filePath = path.join(dirName, fileName);
    const fileStats = fs.statSync(filePath);
    const fileTime = fileStats.mtimeMs;
    const timeDiff = currentTime - fileTime;

    // Convert the time difference to minutes
    const timeDiffInMinutes = timeDiff / (1000 * 60);

    // Check if the time difference is greater than 1 minute
    if (timeDiffInMinutes > 2) {
      // Delete the file using fs.unlinkSync
      fs.unlinkSync(filePath);

      console.log(`File ${filePath} deleted`);
    } else {
      //console.log(`File ${filePath} is not old enough`);
    }
  }
}

setInterval(() => {
  deleteOldFiles();
}, 10000);

/////

// --------------------------- //
/* = Program Scope Variables = */
// --------------------------- //

let targetPleskVersionName;
let targetPleskVersionNumber;
var currentVersionName = "undefined";
var currentVersionNumber = "undefined";
var foundMissingMx = [];

// ------------ //
/* = Scanners = */
// ------------ //

//  Scan all ports with nmap.  -F for faster scanning
const scanPorts = async (domain) => {
  console.log("we are in scanPorts");
  try {
    const { stdout, stderr } = await promisify(exec)(`nmap -F ${domain}`, {
      timeout: 18000,
    });
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  If Plesk is detected, we will find version.
const pleskScan = async (domain) => {
  console.log("we are in pleskScan");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `nmap -sC -p 8443 ${domain}`,
      { timeout: 10000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  Lookup most recent release version for Plesk
const pleskVersionMatchFunction = async () => {
  console.log("we are in pleskVersionMatchFunction");
  return axios
    .get("https://docs.plesk.com/release-notes/obsidian/change-log/")
    .then(async (response) => {
      let pleskReleaseRegex = new RegExp(
        `changelog-entry__title"\>Plesk (?<versionName>\\w+) (?<versionNumber>\\d{1,3}[.]\\d{1,3}[.]\\d{1,3})`
      );
      let currentVersionMatch = await pleskReleaseRegex.exec(response.data);

      if (pleskReleaseRegex.test(response.data)) {
        currentVersionName = currentVersionMatch.groups.versionName;
        currentVersionNumber = currentVersionMatch.groups.versionNumber;
      } else {
        currentVersionName = "undetected";
        currentVersionNumber = "undetected";
      }

      return [currentVersionName, currentVersionNumber];
    })
    .catch((error) => {
      console.error(error);
    });
};

//  Lookup domain's MX records
const digForMx = async (domain) => {
  console.log("we are in digForMx");
  try {
    const { stdout, stderr } = await promisify(exec)(`dig mx ${domain}`, {
      timeout: 5000,
    });
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "";
    }
  } catch (err) {
    return "";
  }
};

//  Resolve MX records to IP
const pingMx = async (mailDomain) => {
  console.log("we are in pingMx");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `ping ${mailDomain} -c 1`,
      { timeout: 3000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  Lookup SPF record
const digForTxt = async (domain) => {
  console.log("we are in digForTxt");
  try {
    const { stdout, stderr } = await promisify(exec)(`dig txt ${domain}`, {
      timeout: 5000,
    });
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  Lookup hostname
const hostScanForName = async (targetIp) => {
  console.log("we are in hostScanForName");
  try {
    const { stdout, stderr } = await promisify(exec)(`host ${targetIp}`, {
      timeout: 7000,
    });
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "undefined";
    }
  } catch (err) {
    return "undefined";
  }
};

//  Detect if WordPress exists & PHP version
const curlForWordpress = async (domain) => {
  console.log("we are in curlForWordpress");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `curl -I ${domain}/wp-login.php --max-time 10`,
      { timeout: 7000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  If WordPress is detected, find the version
const fetchWordPressVersion = async (url) => {
  console.log("we are in fetchWordPressVersion");
  return axios
    .get(url)
    .then(async (response) => {
      let wpVersionRegex = new RegExp(
        `id='login-css' .+login.min.css\\?ver=(?<wpVersionFound>\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})`
      );

      if (wpVersionRegex.test(response.data)) {
        let wpVersionMatch = await wpVersionRegex.exec(response.data);
        let wpVersionNumber = wpVersionMatch.groups.wpVersionFound;

        return wpVersionNumber;
      } else {
        return "undefined";
      }
    })
    .catch((error) => {
      console.error(error);
    });
};

//  Fetch the latest WordPress release version
const fetchLatestWordPress = async () => {
  console.log("we are in fetchLatestWordPress");
  return axios
    .get("https://wordpress.org/download/releases/")
    .then(async (response) => {
      let wpLatestVersionRegex = new RegExp(
        `\\<th class="wp-block-wporg-release-tables__cell-version" scope="row"\\>(?<latestWordPressFound>\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\<`
      );

      if (wpLatestVersionRegex.test(response.data)) {
        let wpLatestVersionMatch = await wpLatestVersionRegex.exec(
          response.data
        );
        let wpLatestVersionNumber =
          wpLatestVersionMatch.groups.latestWordPressFound;

        return wpLatestVersionNumber;
      } else {
        return "undefined";
      }
    })
    .catch((error) => {
      console.error(error);
    });
};

//  WhoIs lookup
const whoIsLookup = async (domain) => {
  console.log("we are in whoIsLookup");
  //  Resolve root domain (remove subdomains)
  let withoutSubdomain = domain.split(".").slice(-2).join(".");

  try {
    const { stdout, stderr } = await promisify(exec)(
      `whois ${withoutSubdomain}`,
      { timeout: 10000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

//  If 443 is open, detect SSL date
const lookupSSL = async (domain) => {
  console.log("we are in lookupSSL");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `nmap -sC -p 443 ${domain}`,
      { timeout: 10000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

const testPort53 = async (domain) => {
  console.log("we are in testPort53");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `nmap -sU -p 53 ${domain}`,
      { timeout: 10000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
};

const whoIsIP = async (ip) => {
  console.log("we are in whoIsIP");
  try {
    const { stdout, stderr } = await promisify(exec)(
      `whois ${ip}`,
      { timeout: 10000 }
    );
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return "error: " + stderr;
    }
  } catch (err) {
    return "error: " + err;
  }
}

// ***************************** //
// ~-=~-=~-=~-=~-=~-=~-=~-=~-=~- // ---------- >
/* Main Domain Scanning Function */
// ~-=~-=~-=~-=~-=~-=~-=~-=~-=~- // ---------- >
// ***************************** //

const scanDomain = async (domain) => {
  let openPortList = [];
  let portsToCheck = [
    21, 22, 25, 53, 80, 110, 143, 443, 465, 993, 995, 1433, 3306, 3389, 5432,
    8443, 8447,
  ];

  //  Scan the domain via nmap function
  let returnedScan = await scanPorts(domain);
  let pleskRegex = new RegExp("8443/tcp\\s+open");

  for (const port of portsToCheck) {
    let testingPortRegex = new RegExp(`${port}\/tcp\\s+open`);
    if (testingPortRegex.test(returnedScan)) {
      openPortList.push(port);
    }
  }

  // Find out target's version of Plesk if port 8443 returned open
  if (pleskRegex.test(returnedScan)) {
    let pleskCheck = await pleskScan(domain);
    let pleskVersionRegex = new RegExp(
      `(?:http-title:\\sPlesk\\s)(?<versionName>\\w+)\\s(?<versionNumber>\\d{1,3}[.]\\d{1,3}[.]\\d{1,3})`
    );
    if (pleskVersionRegex.test(pleskCheck)) {
      let targetMatch = pleskVersionRegex.exec(pleskCheck);
      targetPleskVersionName = targetMatch.groups.versionName;
      targetPleskVersionNumber = targetMatch.groups.versionNumber;

      let currentVersionObject;
      await pleskVersionMatchFunction()
        .then((data) => {
          currentVersionObject = data;
        })
        .catch((error) => console.error(error));
    } else {
      //  Port 8443 is open, but we can't find Plesk version used
      targetPleskVersionName = "unknown";
      targetPleskVersionNumber = "unknown";
    }
  } else {
    // Plesk port not open
    targetPleskVersionName = "undetected";
    targetPleskVersionNumber = "undetected";
  }

  //  Match domain's IP addresses from nmap scan
  let ipMatchingRegex = new RegExp(
    `Nmap scan report for ${domain} \\((?<ipAddress>\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\)`
  );
  if (ipMatchingRegex.test(returnedScan)) {
    // we've found an IPv4
    let ipMatch = ipMatchingRegex.exec(returnedScan);
    var primaryIpAddress = ipMatch.groups.ipAddress;
  } else {
    // no IPv4 found (host is down)
    var primaryIpAddress = "undefined";
  }
  // Capture all alternative IPv4s and IPv6s within one concatenated string
  let secondaryIpMatchingRegex = new RegExp(
    `Other addresses for ${domain} \\(not scanned\\): (?<secondaryIps>.+\\b)`
  );
  if (secondaryIpMatchingRegex.test(returnedScan)) {
    // found secondary IPs
    let secondaryIpMatch = secondaryIpMatchingRegex.exec(returnedScan);
    var secondaryIpAddresses = secondaryIpMatch.groups.secondaryIps;
  } else {
    // no secondary IPs found
    var secondaryIpAddresses = "undefined";
  }

  // Find rDNS
  let rdnsRegex = new RegExp(
    `rDNS record for ${primaryIpAddress}: (?<rdnsRecord>.+)[\\b\\s\\rl\\r]`
  );
  if (rdnsRegex.test(returnedScan)) {
    // rDNS address found
    let rdnsMatch = rdnsRegex.exec(returnedScan);
    var ptrRecord = rdnsMatch.groups.rdnsRecord;
  } else {
    var ptrRecord = "undefined";
  }

  //  Use a dig command to find MX records
  let mxReturned = await digForMx(domain);
  let mxRegex = new RegExp(`IN\\s+MX\\s+\\d{1,2}\\s+(.+)\\.`, "gi");
  let mxArray;
  let foundMxArray = [];

  mxRegex.lastIndex = 0; // reset the last index
  //  Add each MX record to an array
  while ((mxArray = mxRegex.exec(mxReturned)) !== null) {
    console.log("mxArray = " + mxArray);
    let mxRegex2 = new RegExp(
      `IN\\s+MX\\s+\\d{1,2}\\s+(?<mxRecordFound>[\\w\\d\\.\\-]+)\\.`
    );
    let mxRegexMatch2 = mxRegex2.exec(mxArray);
    if (mxRegex2.test(mxArray)) {
      foundMxArray.push(mxRegexMatch2.groups.mxRecordFound);
    }
  }

  console.log("foundMxArray: " + foundMxArray);

  foundMissingMx = [];

  //  Lookup IP address for each MX record
  foundMxArray.forEach(async (mxRecord) => {
    console.log("we are pinging " + mxRecord);
    let mailARecord = await pingMx(mxRecord);
    let pingMxRegex = new RegExp(
      `PING\\s${mxRecord}\\s\\((?<mxIpFound>\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}\\.\\d{1,4})`
    );
    if (pingMxRegex.test(mailARecord)) {
      //  MX record resolved to server, not doing anything with this yet
      //let matchPingMx = pingMxRegex.exec(mailARecord);
      //let foundMxA = matchPingMx.groups.mxIpFound;
      // console.log("found the A for MX " + foundMxA);
    }
    let pingMissingRegex = new RegExp("Name or service not known");
    if (pingMissingRegex.test(mailARecord)) {
      //  Add each invalid MX record to an array
      foundMissingMx.push(mxRecord);
    }
  });

  //  Lookup SPF record
  let findTxtRecord = await digForTxt(domain);
  let spfRegex = new RegExp(`IN\\s+TXT\\s+"(?<spfRecordFound>v=spf1\\s.+)"`);
  if (spfRegex.test(findTxtRecord)) {
    //  Found SPF record
    let spfMatch = spfRegex.exec(findTxtRecord);
    var spfMatchFound = spfMatch.groups.spfRecordFound;
  } else {
    //  No SPF record found
    var spfMatchFound = "missing";
  }

  //  possible function to find mail server HELO response
  /*
  if (openPortList.indexOf(25) > -1) {
    const nmapHostname = await nmapForHostname(domain);
    console.log(nmapHostname);

    // Service Info: Host:  love.unlimitedweb.space
    let hostnameRegex = new RegExp(
      `Host:\\s+(?<foundHostname>.+)[\\b\\s\\rl\\n]`
    );
    if (hostnameRegex.test(nmapHostname)) {
      let hostnameMatch = hostnameRegex.exec(nmapHostname);
      var serverHostname = hostnameMatch.groups.foundHostname;
      console.log(serverHostname);
    } else {
      var serverHostname = "undefined";
    }
  }
  */

  var serverHostname;

  //  Lookup hostname
  let hostScanResults = await hostScanForName(primaryIpAddress);
  let hostnameRegex = new RegExp(
    `domain name pointer (?<foundHostname>[\\w\\d\\..\\-]+)\\.`
  );
  if (hostnameRegex.test(hostScanResults)) {
    let hostnameMatch = hostnameRegex.exec(hostScanResults);
    serverHostname = hostnameMatch.groups.foundHostname;
  } else {
    let hostnameRegex2 = new RegExp(
      // `has address (?<foundHostname>[\\w\\d\\..]+)[\\rl\\b\\s\\n${domain}]+`
      `has address (?<foundHostname>[\\w\\d\\..]+)[\\rl\\b\\s\\n]+`
    );
    if (hostnameRegex2.test(hostScanResults)) {
      let hostnameMatch2 = hostnameRegex2.exec(hostScanResults);
      serverHostname = hostnameMatch2.groups.foundHostname;
    } else {
      serverHostname = "undetected";
    }
  }

  var newLocation;

  var detectWordpress = await curlForWordpress(domain);
  let curlRedirectRegex = new RegExp(
    `[Ll]ocation:\\s+(?<redirectLocation>.+)[\\b\\s\\rl\\n]`
  );
  var curlRedirectLimit = 0;
  while (curlRedirectRegex.test(detectWordpress) && curlRedirectLimit < 6) {
    if (curlRedirectLimit >= 6) {
      return;
    }
    let newLocationMatch = curlRedirectRegex.exec(detectWordpress);
    newLocation = newLocationMatch.groups.redirectLocation;
    detectWordpress = await curlForWordpress(newLocation);
    curlRedirectLimit++;
  }

  let wpLoginRegex = new RegExp(`HTTP/2\\s+200`);
  if (wpLoginRegex.test(detectWordpress)) {
    // WordPress detected
    var wordPress = "detected";
    let phpVersionRegex = new RegExp(
      `PHP/(?<phpVersionDetected>.+)[\\b\\s\\rl\\n]`
    );
    if (phpVersionRegex.test(detectWordpress)) {
      let phpVersionMatch = phpVersionRegex.exec(detectWordpress);
      var phpVersionFound = phpVersionMatch.groups.phpVersionDetected;
    } else {
      var phpVersionFound = "undetected";
    }
  } else {
    // WordPress not detected
    var wordPress = "undetected";
    var phpVersionFound = "undetected";
  }

  if (wordPress === "detected") {
    var wordPressVersion = await fetchWordPressVersion(newLocation);
    var latestWordPress = await fetchLatestWordPress();
  } else {
    var wordPressVersion = "undetected";
    var latestWordPress = "undetected";
  }

  //  WhoIs lookup
  var registrarMatch;
  let whoIsLookupResults = await whoIsLookup(domain);
  let whoIsLookupRegex = new RegExp(
    `Registrar URL: (?<registrarFound>.+)[\\r\\n\\rl\\s]+`
  );
  if (whoIsLookupRegex.test(whoIsLookupResults)) {
    let whoIsMatch = whoIsLookupRegex.exec(whoIsLookupResults);
    let registrarMatchRaw = whoIsMatch.groups.registrarFound;
    registrarMatch = registrarMatchRaw.toLowerCase();
  } else {
    registrarMatch = "undefined";
  }

  let nameServerRegex = new RegExp(
    `Name Server: (?<nameServerFound>.+)[\\r\\n\\rl\\s]+`,
    "gi"
  );
  let nameServerMatch;
  let nameServerArray = [];

  nameServerRegex.lastIndex = 0;
  while (
    (nameServerMatch = nameServerRegex.exec(whoIsLookupResults)) !== null
  ) {
    if (
      nameServerArray.includes(
        nameServerMatch.groups.nameServerFound.toLowerCase()
      )
    ) {
      // Already exists in array
    } else {
      nameServerArray.push(
        nameServerMatch.groups.nameServerFound.toLowerCase()
      );
    }
  }

  var nsNotFound = [];
  var ns53closed = [];
  var ns53filtered = [];

  //  Test port 53 TCP & UDP on all name servers
  nameServerArray.forEach(async (nameServer) => {
    let is53open = await testPort53(nameServer);
    let missingARecordRegex = new RegExp(`Failed to resolve`);
    if (missingARecordRegex.test(is53open)) {
      nsNotFound.push(nameServer);
    }
    let closedPort53Regex = new RegExp(
      `53/(?<protocolClosed>\\w+)\\s+closed\\s+domain`
    );
    if (closedPort53Regex.test(is53open)) {
      let ns53closedMatch = closedPort53Regex.exec(is53open);
      let ns53protocolClosed = ns53closedMatch.groups.protocolClosed;
      ns53closed.push(nameServer + "~" + ns53protocolClosed);
    }
    let filteredPort53Regex = new RegExp(
      `53/(?<protocolFiltered>\\w+)\\s+filtered\\s+domain`
    );
    if (filteredPort53Regex.test(is53open)) {
      let ns53filteredMatch = filteredPort53Regex.exec(is53open);
      let ns53protocolFiltered = ns53filteredMatch.groups.protocolFiltered;
      ns53filtered.push(nameServer + "~" + ns53protocolFiltered);
    }
  });

  //  Lookup SSL date
  var sslExpiryDate;
  var sslIsExpired;
  let sslDateLookup = await lookupSSL(domain);
  let sslDateRegex = new RegExp(
    `Not valid after:\\s+(?<sslExpiryDateFound>.+)[\\r\\n\\rl\\s]+`
  );
  if (sslDateRegex.test(sslDateLookup)) {
    let sslDateMatch = sslDateRegex.exec(sslDateLookup);
    sslExpiryDate = sslDateMatch.groups.sslExpiryDateFound;

    // Convert sslExpiryDate to a Date object
    var sslExpiryDateObj = new Date(sslExpiryDate);

    /* Formatting date and time nicely */

    // Force EST timing
    process.env.TZ = "America/New_York";

    // Get today's date
    var currentDate = new Date();

    console.log("sslExpiryDateObj is " + sslExpiryDateObj);
    console.log("currentDate is " + currentDate);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const hour = currentDate.getHours();
    const minute = currentDate.getMinutes();
    const second = currentDate.getSeconds();

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[month];

    // Convert the hour to 12-hour format and get the AM/PM indicator
    let hour12 = hour % 12;
    if (hour12 === 0) {
      hour12 = 12;
    }
    const ampm = hour < 12 ? "AM" : "PM";
    const minute2 = minute.toString().padStart(2, "0");
    var formattedDate = `${monthName} ${day}, ${year} ${hour12}:${minute2} ${ampm} EST`;

    // Compare dates for SSL
    if (sslExpiryDateObj.getTime() < currentDate.getTime()) {
      //console.log("SSL certificate has expired.");
      sslIsExpired = "true";
    } else {
      //console.log("SSL certificate is still valid.");
      sslIsExpired = "false";
    }
  } else {
    // couldn't match the SSL date
    sslExpiryDate = "unknown";
    sslIsExpired = "unknown";
    // Get today's date
    var currentDate = new Date();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const hour = currentDate.getHours();
    const minute = currentDate.getMinutes();
    const second = currentDate.getSeconds();

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[month];

    // Convert the hour to 12-hour format and get the AM/PM indicator
    let hour12 = hour % 12;
    if (hour12 === 0) {
      hour12 = 12;
    }
    const ampm = hour < 12 ? "AM" : "PM";
    const minute2 = minute.toString().padStart(2, "0");
    var formattedDate = `${monthName} ${day}, ${year} ${hour12}:${minute2} ${ampm} EST`;
  }

  var ipWhoIs;
  // WhoIs on IP
  if (primaryIpAddress != "undefined") {
    ipWhoIs = await whoIsIP(primaryIpAddress);
    let ipWhoIsRegex1 = new RegExp(
      /1AN1/
    );
    let ipWhoIsRegex2 = new RegExp(
      /[Ii][Oo][Nn][Oo][Ss]/
    );

    if (ipWhoIsRegex1.test(ipWhoIs) | ipWhoIsRegex2.test(ipWhoIs)) {
      ipWhoIs = "IONOS"
    } else {
      ipWhoIs = "undefined";
    }
  } else {
    ipWhoIs = "undefined";
  }

  return {
    openPorts: openPortList,
    targetPleskName: targetPleskVersionName,
    targetPleskVersion: targetPleskVersionNumber,
    currentPleskName: currentVersionName,
    currentPleskVersion: currentVersionNumber,
    targetWordPressVersion: wordPressVersion,
    currentWordPressVersion: latestWordPress,
    targetPhpVersion: phpVersionFound,
    domainMainIp: primaryIpAddress,
    domainSecondaryIps: secondaryIpAddresses,
    reverseDNS: ptrRecord,
    mailServer: foundMxArray,
    mxUnresolved: foundMissingMx,
    spfRecord: spfMatchFound,
    hostName: serverHostname,
    domainRegistrar: registrarMatch,
    nameServers: nameServerArray,
    sslExpiry: sslExpiryDate,
    sslExpired: sslIsExpired,
    nsMissingDNS: nsNotFound,
    nsClosed: ns53closed,
    nsFiltered: ns53filtered,
    queryDate: formattedDate,
    anotherValue: "1",
    error: "none",
    ipOwner: ipWhoIs,
  };
};
