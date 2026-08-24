require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }, 
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545" 
    },
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};