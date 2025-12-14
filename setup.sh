#!/bin/bash

# HALO Setup Script
# This script will set up both backend and frontend

echo "🚀 Setting up HALO (Haven's AI Logistic Operator)..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    echo "   Or use: brew install node (macOS)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Setup Backend
echo "📦 Setting up Backend..."
cd "$(dirname "$0")"

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp env.example .env
    echo "✅ Created .env file. Please edit it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Setup Frontend
echo ""
echo "📦 Setting up Frontend..."
cd halo-ui

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating frontend .env file..."
    cp env.example .env
    echo "✅ Created frontend .env file"
else
    echo "✅ Frontend .env file already exists"
fi

cd ..

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Edit the .env files with your configuration:"
echo "   - Backend: $(pwd)/.env"
echo "   - Frontend: $(pwd)/halo-ui/.env"
echo ""
echo "2. Start the backend:"
echo "   cd $(pwd)"
echo "   npm run dev"
echo ""
echo "3. Start the frontend (in a new terminal):"
echo "   cd $(pwd)/halo-ui"
echo "   npm run dev"
echo ""
echo "4. Open your browser to: http://localhost:70070"
echo ""
echo "📚 For detailed setup instructions, see:"
echo "   - README.md (Backend)"
echo "   - halo-ui/README.md (Frontend)"
echo "   - SETUP_GUIDE.md (Backend)"
echo "   - halo-ui/SETUP_GUIDE.md (Frontend)"
