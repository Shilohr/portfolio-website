const bcrypt = require('bcryptjs');

async function testTokenComparison() {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjE5NDM5ODMsImV4cCI6MTc2MjAzMDM4M30.fiRp3CK4G6O1N-q0PqfplLOKVQr9PSU2WBP_MCjDAqk";
    const storedHash = "$2a$12$BGEQ/xMFvmSlNGZ.TmYghOFPhBSwXT660Zmj3UeOa69oCNV.0kKGS"; // from session id 10
    
    console.log('Token:', token);
    console.log('Stored hash:', storedHash);
    
    // Test comparison
    const result = await bcrypt.compare(token, storedHash);
    console.log('Comparison result:', result);
    
    // Test creating new hash
    const newHash = await bcrypt.hash(token, 12);
    console.log('New hash:', newHash);
    
    // Test comparing with new hash
    const newResult = await bcrypt.compare(token, newHash);
    console.log('New hash comparison:', newResult);
}

testTokenComparison().catch(console.error);