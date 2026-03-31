require("dotenv").config({ path: "../backend/.env" });
console.log("Private Key length:", process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.length : "undefined");
