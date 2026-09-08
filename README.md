# Daymark diary

Start MongoDB locally or create a MongoDB Atlas database, then run the API in one terminal:

```powershell
cd backend
npm run dev
```

Run the React client in another:

```powershell
cd frontend
npm run dev
```

The local settings are in `backend/.env` and `frontend/.env`. The API uses the `daymark` MongoDB database by default. Configure `MONGODB_URI` (for example, an Atlas connection URI), `MONGODB_DB`, a unique `JWT_SECRET`, and optionally `CLIENT_ORIGIN` for production.
