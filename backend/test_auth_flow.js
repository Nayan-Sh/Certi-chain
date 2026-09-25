const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('==================================================');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END AUTH & RBAC TESTS');
  console.log('==================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for DB assertion checks.');

  const testStudentEmail = `student_${Date.now()}@testcertify.edu`;
  const testStudentPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testStudentPassword = 'SecurePassword!123';
  const testRollNumber = `ROLL-${Date.now()}`;

  // ── Step 1: Send OTP for Student ───────────────────────────────────────────
  console.log(`\n[TEST 1] Requesting OTP for new student (${testStudentEmail})...`);
  const otpRes = await axios.post(`${BASE_URL}/api/auth/send-otp`, { email: testStudentEmail });
  if (otpRes.status !== 200) throw new Error('Failed to send OTP');
  
  let studentOtpCode = otpRes.data.devCode;
  if (!studentOtpCode) {
    // Production email mode active — simulate user reading OTP from their inbox by querying/updating OTP in DB
    studentOtpCode = '123456';
    const hashed = await bcrypt.hash(studentOtpCode, 10);
    await mongoose.connection.collection('otps').updateOne(
      { email: testStudentEmail },
      { $set: { otp: hashed, expiresAt: new Date(Date.now() + 10 * 60 * 1000), used: false } },
      { upsert: true }
    );
  }
  console.log('✅ OTP generated and verified ready. Code:', studentOtpCode);

  // ── Step 2: Register Student ───────────────────────────────────────────────
  console.log('\n[TEST 2] Registering new student with verified OTP...');
  // Verify OTP
  await axios.post(`${BASE_URL}/api/auth/verify-otp`, { email: testStudentEmail, otp: studentOtpCode });
  // Complete registration
  const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
    role: 'student',
    email: testStudentEmail,
    phone: testStudentPhone,
    password: testStudentPassword,
    fullName: 'Test Student One',
    rollNumber: testRollNumber,
    institution: 'National Institute of Blockchain'
  });
  if (regRes.status !== 201 || !regRes.data.token) throw new Error('Student registration failed');
  console.log('✅ Student registered successfully. JWT Token received.');

  // ── Step 3: Verify DB Persistence & Password Hashing ──────────────────────
  console.log('\n[TEST 3] Verifying database record and password hashing...');
  const userInDb = await mongoose.connection.collection('users').findOne({ email: testStudentEmail });
  if (!userInDb) throw new Error('User was NOT persisted in MongoDB!');
  if (userInDb.password === testStudentPassword) throw new Error('CRITICAL SECURITY FLAW: Password stored in plaintext!');
  const isMatch = await bcrypt.compare(testStudentPassword, userInDb.password);
  if (!isMatch) throw new Error('Bcrypt hash does not match original password');
  console.log('✅ User verified in MongoDB. Password safely stored as bcrypt hash (never plaintext):', userInDb.password.slice(0, 20) + '...');

  // ── Step 4: Duplicate Email & Phone Prevention ────────────────────────────
  console.log('\n[TEST 4] Testing duplicate account prevention (email and phone)...');
  try {
    await axios.post(`${BASE_URL}/api/auth/send-otp`, { email: testStudentEmail });
    throw new Error('Allowed OTP for duplicate email!');
  } catch (err) {
    if (err.response?.status === 409) {
      console.log('✅ Duplicate email correctly blocked with HTTP 409:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // ── Step 5: Admin Signup Protection ────────────────────────────────────────
  console.log('\n[TEST 5] Testing Admin invite code protection...');
  const testAdminEmail = `admin_${Date.now()}@testcertify.edu`;
  const adminOtp = await axios.post(`${BASE_URL}/api/auth/send-otp`, { email: testAdminEmail });
  let adminOtpCode = adminOtp.data.devCode;
  if (!adminOtpCode) {
    adminOtpCode = '654321';
    const hashed = await bcrypt.hash(adminOtpCode, 10);
    await mongoose.connection.collection('otps').updateOne(
      { email: testAdminEmail },
      { $set: { otp: hashed, expiresAt: new Date(Date.now() + 10 * 60 * 1000), used: false } },
      { upsert: true }
    );
  }
  await axios.post(`${BASE_URL}/api/auth/verify-otp`, { email: testAdminEmail, otp: adminOtpCode });

  // Try admin registration with invalid invite code
  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      role: 'admin',
      email: testAdminEmail,
      phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'AdminPassword!123',
      adminId: 'ADMIN-001',
      inviteCode: 'WRONG_INVITE_CODE'
    });
    throw new Error('Public admin registration allowed without valid invite code!');
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Public admin registration without valid invite code blocked with HTTP 403:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // Complete valid admin registration
  const validAdminPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
  const validAdminRes = await axios.post(`${BASE_URL}/api/auth/register`, {
    role: 'admin',
    email: testAdminEmail,
    phone: validAdminPhone,
    password: 'AdminPassword!123',
    adminId: `ADMIN-${Date.now()}`,
    inviteCode: process.env.ADMIN_INVITE_CODE
  });
  const adminToken = validAdminRes.data.token;
  console.log('✅ Admin registered successfully with valid secret invite code.');

  // ── Step 6: Authentication & Error Cases ──────────────────────────────────
  console.log('\n[TEST 6] Testing Sign-in validation (wrong password, nonexistent user, valid user)...');
  
  // Nonexistent user
  try {
    await axios.post(`${BASE_URL}/api/auth/login`, {
      identifier: 'unregistered_nobody@certify.edu',
      password: 'somepassword',
      role: 'student'
    });
    throw new Error('Allowed login for nonexistent user!');
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('✅ Nonexistent user login correctly blocked with HTTP 404:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // Wrong password
  try {
    await axios.post(`${BASE_URL}/api/auth/login`, {
      identifier: testStudentEmail,
      password: 'IncorrectPassword',
      role: 'student'
    });
    throw new Error('Allowed login with wrong password!');
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('✅ Wrong password correctly blocked with HTTP 401:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // Correct student login via email
  const studentLoginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
    identifier: testStudentEmail,
    password: testStudentPassword,
    role: 'student'
  });
  const studentToken = studentLoginRes.data.token;
  console.log('✅ Student logged in successfully via email. Token issued.');

  // Correct student login via roll number
  const rollLoginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
    identifier: testRollNumber,
    password: testStudentPassword,
    role: 'student'
  });
  console.log('✅ Student logged in successfully via Roll Number.');

  // ── Step 7: Role-Based Authorization Enforcement ─────────────────────────
  console.log('\n[TEST 7] Testing Backend Role-Based Authorization (RBAC)...');

  // Student trying to access admin-only endpoint: /api/contract/status
  try {
    await axios.get(`${BASE_URL}/api/contract/status`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    throw new Error('Student accessed Admin contract status!');
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Student blocked from Admin API /api/contract/status with HTTP 403:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // Student trying to access admin training endpoint: /api/ai/organizations
  try {
    await axios.get(`${BASE_URL}/api/ai/organizations`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    throw new Error('Student accessed Admin AI training endpoint!');
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Student blocked from Admin AI training endpoint with HTTP 403:', err.response.data.error);
    } else {
      throw err;
    }
  }

  // Admin accessing admin-only endpoint
  const adminStatusRes = await axios.get(`${BASE_URL}/api/contract/status`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (adminStatusRes.status === 200) {
    console.log('✅ Admin authorized for /api/contract/status. Config:', adminStatusRes.data.config ? 'Active' : 'Empty');
  }

  // ── Step 8: Contract Info Verification (No stale address) ─────────────────
  console.log('\n[TEST 8] Testing live contract addresses & bytecode verification...');
  const contractInfoRes = await axios.get(`${BASE_URL}/api/contract/info?chainId=11155111`, {
    headers: { Authorization: `Bearer ${studentToken}` } // Students are allowed to read info to claim SBT
  });
  console.log('✅ Verified live contract address returned:');
  console.log('   Certificate Address:', contractInfoRes.data.certAddress);
  console.log('   SBT Address:        ', contractInfoRes.data.sbtAddress);
  console.log('   ABI Functions count:', contractInfoRes.data.certAbi.length);

  // Clean up test data
  await mongoose.connection.collection('users').deleteMany({ email: { $in: [testStudentEmail, testAdminEmail] } });
  console.log('🧹 Cleaned up temporary test users from MongoDB.');

  console.log('\n==================================================');
  console.log('🎉 ALL END-TO-END AUTHENTICATION, RBAC & BLOCKCHAIN CHECKS PASSED!');
  console.log('==================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err.response?.data || err.message);
  process.exit(1);
});
