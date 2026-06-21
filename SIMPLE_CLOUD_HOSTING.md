# Pharmora: Simple Git-Push Hosting Guide (Vercel, Netlify, Render, Railway)

If you want to host Pharmora without setting up complex cloud infrastructure (like AWS EKS or Kubernetes), you can use developer-friendly SaaS platforms. By linking your **GitHub Repository**, these platforms will automatically build and deploy your application every time you push to your main branch.

---

## 1. Hosting the Frontend (Vercel or Netlify)

Vercel and Netlify are perfect for hosting the React frontend. They compile static assets and host them globally on CDNs for free.

### Step 1: Create a Vercel/Netlify Account
Sign up on [Vercel](https://vercel.com) or [Netlify](https://netlify.com) using your GitHub account.

### Step 2: Import the Project
1. Click **Add New** -> **Project** on Vercel.
2. Select your `pharmora` GitHub repository.

### Step 3: Configure Build & Directory Settings
Since the project is a monorepo, you must tell Vercel to only build the `frontend` folder:
* **Root Directory**: `frontend` (Vercel will look inside this folder).
* **Framework Preset**: `Vite` (automatically detected).
* **Build Command**: `npm run build`
* **Output Directory**: `dist`

### Step 4: Add Environment Variables
Add the following variable under **Environment Variables** in the Vercel dashboard:
* **Key**: `VITE_API_BASE_URL`
* **Value**: `https://your-backend-gateway-url.railway.app` (This is the URL of your API Gateway deployed in the next section).

Click **Deploy**. Every push to GitHub will automatically trigger a new build!

---

## 2. Hosting Backend & Databases (Railway or Render)

Vercel and Netlify only host static files and serverless functions; they cannot host persistent FastAPI servers, PostgreSQL databases, or Redis caches. For these, we use **Railway** or **Render**, which provide a very similar "Git-push to deploy" experience for backends.

### Option A: Hosting on Railway (Recommended - Fastest Setup)
[Railway.app](https://railway.app) allows you to spin up databases and microservices in a single workspace.

1. **Deploy Databases**:
   - Go to Railway, click **New Project** -> **Provision PostgreSQL**.
   - Click **New** -> **Provision Redis**.
   - Click **New** -> **Provision Apache Kafka** (or keep `KAFKA_MOCK=true` to save database costs).

2. **Deploy the API Gateway & Microservices**:
   - Click **New** -> **GitHub Repo** -> Choose your repo.
   - For each service, go to **Settings** -> **General** and configure the:
     - **Source Directory** (e.g., `services/api_gateway` or `services/auth_service`).
     - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT}`
   - In **Variables**, link the databases. Railway exposes credentials automatically:
     - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
     - `REDIS_URL`: `${{Redis.REDIS_URL}}`
     - `KAFKA_BOOTSTRAP_SERVERS`: `${{Kafka.KAFKA_BOOTSTRAP_SERVERS}}` (or set `KAFKA_MOCK=true`).

---

### Option B: Hosting on Render
[Render.com](https://render.com) is another excellent Git-push provider.

1. **Deploy PostgreSQL & Redis**:
   - In the Render dashboard, click **New** -> **PostgreSQL**. Create the database and copy the **Internal Database URL**.
   - Click **New** -> **Redis**. Copy the **Internal Redis URL**.

2. **Deploy Microservices**:
   - Click **New** -> **Web Service**.
   - Choose your GitHub repository.
   - For each microservice (Auth, Inventory, Sales, Gateway):
     - **Root Directory**: `services/auth_service` (or corresponding folder).
     - **Runtime**: `Python`
     - **Build Command**: `pip install -r ../../requirements.txt` (or let it build from the root `pyproject.toml`).
     - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port 10000`
     - **Environment Variables**:
       - `DATABASE_URL`: Paste the PostgreSQL URL.
       - `REDIS_URL`: Paste the Redis URL.
       - `KAFKA_MOCK`: `true` (if running without managed Kafka).

Once all backend services are live, take the **API Gateway Web Service URL** and set it as `VITE_API_BASE_URL` in Vercel!
