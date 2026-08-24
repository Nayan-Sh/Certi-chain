const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

async function testLogin() {
  await mongoose.connect('mongodb://127.0.0.1:27017/certificatesDB');

  // Test ADMIN-001
  const identifier = 'ADMIN-001';
  const password = 'password123';

  const trimmedIdentifier = identifier.trim();
  const lowerIdentifier = trimmedIdentifier.toLowerCase();

  console.log('Test 1 - ADMIN-001:');
  console.log('  trimmedIdentifier:', trimmedIdentifier);
  console.log('  lowerIdentifier:', lowerIdentifier);
  console.log('  includes @:', lowerIdentifier.includes('@'));
  console.log('  startsWith ADMIN-:', trimmedIdentifier.toUpperCase().startsWith('ADMIN-'));
  console.log('  adminIdUpper:', trimmedIdentifier.toUpperCase());

  let user = await User.findOne({ adminId: trimmedIdentifier.toUpperCase() });
  console.log('  Found user:', user ? { email: user.email, adminId: user.adminId } : null);

  if (user) {
    const match = await bcrypt.compare(password, user.password);
    console.log('  Password match:', match);
  }

  console.log('');
  console.log('Test 2 - CS2024002:');
  const identifier2 = 'CS2024002';
  const trimmed2 = identifier2.trim();
  const lower2 = trimmed2.toLowerCase();

  console.log('  trimmedIdentifier:', trimmed2);
  console.log('  lowerIdentifier:', lower2);
  console.log('  includes @:', lower2.includes('@'));
  console.log('  startsWith ADMIN-:', trimmed2.toUpperCase().startsWith('ADMIN-'));

  const regexPattern = '^' + trimmed2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  console.log('  Regex pattern:', regexPattern);

  user = await User.findOne({
    $or: [
      { rollNumber: { $regex: regexPattern, $options: 'i' } },
      { email: lower2 }
    ]
  });
  console.log('  Found user:', user ? { email: user.email, rollNumber: user.rollNumber } : null);

  if (user) {
    const match = await bcrypt.compare(password, user.password);
    console.log('  Password match:', match);
  }

  await mongoose.disconnect();
}
testLogin().catch(console.error);