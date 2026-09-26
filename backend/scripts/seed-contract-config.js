/**
 * Seed script: Register the already-deployed Sepolia contract addresses
 * in the ContractConfig collection so the backend finds them.
 *
 * Run once:  node scripts/seed-contract-config.js
 *
 * This is idempotent — it upserts the record keyed by chainId "11155111".
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ContractConfig = require('../models/ContractConfig');

const SEPOLIA_CHAIN_ID = '11155111';

const CERT_ADDRESS  = '0x51F9B8800a57055A8530630DD486B85BbC030Fb1';
const SBT_ADDRESS   = '0xD42D518322E729A755f3e7266296E2a0b61e3c74';
const DEPLOYER      = '0x260595eE03507230312141789eB2FFF8Bf08EB35';

async function main() {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/certificatesDB';
    await mongoose.connect(uri);
    console.log('[seed] Connected to MongoDB');

    const config = await ContractConfig.findByIdAndUpdate(
        SEPOLIA_CHAIN_ID,
        {
            certAddress: CERT_ADDRESS,
            sbtAddress:  SBT_ADDRESS,
            deployedBy:  DEPLOYER,
            deployedAt:  new Date(),
            chainId:     Number(SEPOLIA_CHAIN_ID),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log('[seed] ContractConfig upserted:');
    console.log(JSON.stringify(config.toObject(), null, 2));

    await mongoose.disconnect();
    console.log('[seed] Done.');
}

main().catch(err => {
    console.error('[seed] FATAL:', err);
    process.exit(1);
});
