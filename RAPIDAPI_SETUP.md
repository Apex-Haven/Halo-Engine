# RapidAPI Hotel Search Setup (Agoda)

## Overview

The hotel search system now uses **RapidAPI with Agoda Com API** exclusively. All previous implementations (CozyCozy, MakeMyTrip, Yatra, Cleartrip) have been removed.

## Setup Instructions

### 1. Get RapidAPI Key

1. Go to [https://rapidapi.com/](https://rapidapi.com/)
2. Sign up for a free account
3. Get your API key from the dashboard

### 2. Subscribe to Agoda Com API

1. Visit [Agoda Com API on RapidAPI](https://rapidapi.com/apidojo/api/agoda-com)
2. Click "Subscribe" and choose a plan (free tier available)
3. Your API key will be automatically available

### 3. Configure Environment Variables

Add to your `.env` file or Render.com environment variables:

```env
# RapidAPI Configuration (Agoda)
RAPIDAPI_KEY=fdf79338acmshb8b3f243c0063c1p1dee3fjsn307375807fc1
RAPIDAPI_HOTEL_HOST=agoda-com.p.rapidapi.com
RAPIDAPI_HOTEL_URL=https://agoda-com.p.rapidapi.com
```

### 4. API Endpoints Used

The service uses these Agoda API endpoints:
- `GET /hotels/search-overnight` - Search hotels by location with check-in/check-out dates
- Parameters:
  - `id` - Location ID (format: "1_318" for region_city) or city name
  - `checkinDate` - Check-in date (format: YYYY-MM-DD)
  - `checkoutDate` - Check-out date (format: YYYY-MM-DD)
  - Optional: `adults`, `rooms`, `currency`

### 5. Response Format

The service handles multiple response formats:
- `response.data` (array)
- `response.data.result` (array or object)
- `response.data.data` (array or object)
- `response.data.hotels` (array or object)

## Testing

After setting up your RapidAPI key, test the search:

```bash
# The service will automatically use RapidAPI when generating recommendations
# Check server logs for:
# ✅ Found X hotels from RapidAPI
```

## Troubleshooting

### No hotels found
- Check `RAPIDAPI_KEY` is set correctly
- Verify you're subscribed to Agoda Com API on RapidAPI
- Check API rate limits (free tier has limits)
- Review server logs for error messages
- Verify location ID format - Agoda uses format like "1_318" (region_city)

### API errors
- Check API subscription status on RapidAPI dashboard
- Verify `RAPIDAPI_HOTEL_HOST` is set to `agoda-com.p.rapidapi.com`
- Verify `RAPIDAPI_HOTEL_URL` is set to `https://agoda-com.p.rapidapi.com`
- Check Agoda API documentation for correct endpoint format
- Ensure date format is YYYY-MM-DD

### Location ID Issues
- Agoda uses location IDs in format "region_city" (e.g., "1_318")
- If location ID is not found, the service will try using city name directly
- You may need to maintain a mapping of city names to Agoda location IDs
- Check Agoda API documentation for location lookup endpoints

## Removed Services

The following services have been **completely removed**:
- ❌ CozyCozy
- ❌ MakeMyTrip
- ❌ Yatra
- ❌ Cleartrip
- ❌ Mock hotel generation (fallback)

All hotel searches now go through RapidAPI only.

