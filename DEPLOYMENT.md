# 🚀 HALO Deployment Guide

## 📋 Prerequisites

- GitHub account
- Railway account (free tier)
- Vercel account (free tier)
- MongoDB Atlas account (free tier)

## 🗂️ Step 1: Create GitHub Organization & Repositories

### 1.1 Create GitHub Organization
1. Go to [GitHub](https://github.com)
2. Click "New organization"
3. Choose "Free" plan
4. Name: `Apex-Haven`
5. Create organization

### 1.2 Create Repositories
1. In your organization, create two repositories:
   - `halo-backend` (for Node.js backend)
   - `halo-frontend` (for React frontend)

### 1.3 Push Code to GitHub
```bash
# Backend
cd /Users/stalin/Workspace/Halo
git init
git add .
git commit -m "Initial HALO backend commit"
git branch -M main
git remote add origin https://github.com/Apex-Haven/halo-backend.git
git push -u origin main

# Frontend
cd /Users/stalin/Workspace/Halo/halo-ui
git init
git add .
git commit -m "Initial HALO frontend commit"
git branch -M main
git remote add origin https://github.com/Apex-Haven/halo-frontend.git
git push -u origin main
```

## 🗄️ Step 2: Setup MongoDB Atlas

### 2.1 Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Sign up for free account
3. Create new project: "HALO"

### 2.2 Create Database Cluster
1. Click "Build a Database"
2. Choose "M0 Sandbox" (Free tier)
3. Provider: AWS
4. Region: Choose closest to your users
5. Cluster name: "halo-cluster"
6. Click "Create"

### 2.3 Configure Database Access
1. Go to "Database Access"
2. Click "Add New Database User"
3. Username: `halo-user`
4. Password: Generate secure password
5. Database User Privileges: "Read and write to any database"
6. Click "Add User"

### 2.4 Configure Network Access
1. Go to "Network Access"
2. Click "Add IP Address"
3. Choose "Allow access from anywhere" (0.0.0.0/0)
4. Click "Confirm"

### 2.5 Get Connection String
1. Go to "Database"
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Driver: Node.js
5. Version: 4.1 or later
6. Copy the connection string
7. Replace `<password>` with your database user password

## 🚂 Step 3: Deploy Backend to Railway

### 3.1 Create Railway Account
1. Go to [Railway](https://railway.app)
2. Sign up with GitHub
3. Authorize Railway to access your repositories

### 3.2 Deploy Backend
1. Click "New Project"
2. Choose "Deploy from GitHub repo"
3. Select `Apex-Haven/halo-backend`
4. Railway will automatically detect Node.js and deploy

### 3.3 Configure Environment Variables
1. Go to your project dashboard
2. Click on "Variables" tab
3. Add the following variables:

```bash
NODE_ENV=production
PORT=707
MONGODB_URI=mongodb+srv://halo-user:YOUR_PASSWORD@halo-cluster.xxxxx.mongodb.net/halo?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app
```

### 3.4 Get Railway URL
1. After deployment, Railway will provide a URL like:
   `https://halo-backend-production-xxxx.up.railway.app`
2. Copy this URL - you'll need it for the frontend

## ⚡ Step 4: Deploy Frontend to Vercel

### 4.1 Create Vercel Account
1. Go to [Vercel](https://vercel.com)
2. Sign up with GitHub
3. Authorize Vercel to access your repositories

### 4.2 Deploy Frontend
1. Click "New Project"
2. Import `Apex-Haven/halo-frontend`
3. Vercel will automatically detect Vite/React
4. Click "Deploy"

### 4.3 Configure Environment Variables
1. Go to your project dashboard
2. Click "Settings" → "Environment Variables"
3. Add the following variable:

```bash
VITE_API_BASE_URL=https://halo-backend-production-xxxx.up.railway.app/api
```

### 4.4 Redeploy
1. After adding environment variables, click "Redeploy"
2. Vercel will rebuild with the new environment variables

## 🔧 Step 5: Update CORS Settings

### 5.1 Update Backend CORS
1. Go back to Railway
2. Update the `ALLOWED_ORIGINS` variable:
```bash
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
```

### 5.2 Redeploy Backend
1. Railway will automatically redeploy when you update variables

## ✅ Step 6: Test Production Deployment

### 6.1 Test Backend
1. Visit: `https://your-railway-url.up.railway.app/health`
2. Should return: `{"status":"OK","timestamp":"..."}`

### 6.2 Test Frontend
1. Visit your Vercel URL
2. Try logging in with test credentials:
   - Admin: `admin@halo.com` / `admin123`
   - Driver: `driver@halo.com` / `driver123`
   - Customer: `customer@halo.com` / `customer123`

### 6.3 Test API Connection
1. Open browser developer tools
2. Check Network tab for API calls
3. Verify calls are going to Railway URL

## 🎉 Step 7: Custom Domain (Optional)

### 7.1 Backend Custom Domain
1. In Railway, go to "Settings" → "Domains"
2. Add your custom domain (e.g., `api.halo.apex.com`)
3. Update DNS records as instructed

### 7.2 Frontend Custom Domain
1. In Vercel, go to "Settings" → "Domains"
2. Add your custom domain (e.g., `halo.apex.com`)
3. Update DNS records as instructed

## 📊 Monitoring & Maintenance

### Health Checks
- Backend: `https://your-railway-url.up.railway.app/health`
- Frontend: Your Vercel domain

### Logs
- Railway: Project dashboard → "Deployments" → View logs
- Vercel: Project dashboard → "Functions" → View logs

### Updates
- Push changes to GitHub
- Railway and Vercel will automatically redeploy

## 🆘 Troubleshooting

### Common Issues
1. **CORS Errors**: Check `ALLOWED_ORIGINS` in Railway
2. **Database Connection**: Verify MongoDB Atlas connection string
3. **Environment Variables**: Ensure all required variables are set
4. **Build Failures**: Check logs in Railway/Vercel dashboards

### Support
- Railway: [Railway Discord](https://discord.gg/railway)
- Vercel: [Vercel Community](https://github.com/vercel/vercel/discussions)
- MongoDB: [MongoDB Community](https://community.mongodb.com/)

## 💰 Cost Breakdown

| Service | Free Tier | Production Cost |
|---------|-----------|-----------------|
| Railway | $5/month credit | $5/month |
| Vercel | Free forever | Free |
| MongoDB Atlas | 512MB free | $9/month |
| **Total** | **$0/month** | **$14/month** |

---

🎉 **Congratulations! Your HALO application is now live in production!**
