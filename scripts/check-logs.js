#!/usr/bin/env node

/**
 * Simple script to check server logs for Travel Advisory debugging
 * Usage: node scripts/check-logs.js
 */

const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const logFile = path.join(logDir, 'app.log');

console.log('🔍 Checking Travel Advisory logs...\n');

// Check if log directory exists
if (!fs.existsSync(logDir)) {
  console.log('⚠️  Log directory does not exist:', logDir);
  console.log('💡 Logs are likely being printed to console. Check your terminal where you ran "npm run dev"\n');
  process.exit(0);
}

// Check if log file exists
if (!fs.existsSync(logFile)) {
  console.log('⚠️  Log file does not exist:', logFile);
  console.log('💡 Logs are likely being printed to console. Check your terminal where you ran "npm run dev"\n');
  process.exit(0);
}

// Read and filter logs
try {
  const logContent = fs.readFileSync(logFile, 'utf8');
  const lines = logContent.split('\n');
  
  // Filter for Travel Advisory related logs
  const relevantLines = lines.filter(line => 
    line.includes('🔍') || 
    line.includes('🏨') || 
    line.includes('📊') || 
    line.includes('✅') || 
    line.includes('❌') || 
    line.includes('⚠️') ||
    line.toLowerCase().includes('travel') ||
    line.toLowerCase().includes('recommendation') ||
    line.toLowerCase().includes('hotel') ||
    line.toLowerCase().includes('preference')
  );

  if (relevantLines.length === 0) {
    console.log('ℹ️  No Travel Advisory logs found in log file.');
    console.log('💡 Logs are likely being printed to console. Check your terminal where you ran "npm run dev"\n');
  } else {
    console.log(`📋 Found ${relevantLines.length} relevant log entries:\n`);
    console.log(relevantLines.slice(-50).join('\n')); // Show last 50 lines
  }
} catch (error) {
  console.error('❌ Error reading log file:', error.message);
  console.log('💡 Logs are likely being printed to console. Check your terminal where you ran "npm run dev"\n');
}

console.log('\n💡 To see real-time logs, check the terminal where you ran "npm run dev"');
console.log('💡 Or run: tail -f logs/app.log (if logs are being written to file)\n');

