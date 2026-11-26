# Forecast Finder

A responsive web app that shows a 14-day weather forecast for any city. Users can search for a city, sort days (date, hottest, coldest, wettest), filter days (rain likely, mostly dry, warm), and switch between °C and °F. It helps people plan travel, events, and outdoor work.

**Tech:** HTML, CSS, vanilla JavaScript. No build step, no dependencies, no API key.

## Live links

| What | URL |
|---|---|
| Load balancer (use this one) | http://52.56.152.51/ |
| Web01 | http://16.60.136.184/ |
| Web02 | http://18.133.182.40/ |

The footer of the page shows which server answered (`Served by: 7319-web-01` or `7319-web-02`). Refresh through the load balancer and the name alternates.

## APIs used and credits

- **Open-Meteo Forecast API** – https://open-meteo.com/en/docs
- **Open-Meteo Geocoding API** – https://open-meteo.com/en/docs/geocoding-api

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Free for non-commercial use.
Font: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (Google Fonts, OFL). Servers: Nginx and HAProxy.

**API keys and credentials:** none are needed, so nothing secret is stored in this repo. The app has no login.

## Features

- City search, with a pick-list when several cities share the name
- Sort and filter the forecast, and a °C/°F switch
- Error handling: city not found, API down, timeouts, bad responses
- Responses cached for 10 minutes (sessionStorage), and the last city is remembered
- All text from the API is inserted with `textContent` (protects against XSS)
- Footer shows which server handled the request

## Run locally

```bash
git clone https://github.com/gkarenzi-lang/forecast-finder.git
cd forecast-finder
python3 -m http.server 8000
```

Open http://localhost:8000 in a browser. (`npx serve` also works.)

---

## Deployment

### How it fits together

```
                      Visitor
                         |
                         v
                +-----------------+
                |  Lb01 (HAProxy) |   52.56.152.51
                |  round-robin    |
                +--------+--------+
                         |
            +------------+------------+
            v                         v
   +-----------------+       +-----------------+
   | Web01 (Nginx)   |       | Web02 (Nginx)   |
   | 16.60.136.184   |       | 18.133.182.40   |
   +-----------------+       +-----------------+
```

Both web servers hold an identical copy of this repo. The load balancer sends each new request to the next server in turn, and stops using a server that fails its health check.

All three servers run Ubuntu and the login name is `ubuntu`. You connect with an SSH key, for example:

```bash
ssh -i ~/.ssh/YOUR_KEY ubuntu@16.60.136.184
```

### Step 1: Deploy the app on Web01

Log in to Web01 (`16.60.136.184`), then run each block below.

**1a. Install Nginx and Git, and download the code**

```bash
sudo apt update && sudo apt install -y nginx git
sudo git clone https://github.com/gkarenzi-lang/forecast-finder.git /var/www/forecast
```

**1b. Create the Nginx site file**

```bash
sudo tee /etc/nginx/sites-available/forecast > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/forecast;
    index index.html;

    # Shows which server answered (displayed in the page footer)
    add_header X-Served-By $hostname always;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF
```

What it does: Nginx listens on port 80, serves the files in `/var/www/forecast`, and adds an `X-Served-By` header containing the server's hostname to every response.

**1c. Switch it on**

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/forecast /etc/nginx/sites-enabled/forecast
sudo nginx -t && sudo systemctl reload nginx
```

Expected output: `syntax is ok` and `test is successful`.

**1d. Check it**

Open http://16.60.136.184/ in a browser. You should see Forecast Finder with `Served by: 7319-web-01` in the footer.

### Step 2: Deploy the app on Web02

Log in to Web02 (`18.133.182.40`) and repeat steps 1a to 1c exactly as written. Then open http://18.133.182.40/. The footer should say `Served by: 7319-web-02`.

### Step 3: Configure the load balancer (Lb01)

Log in to Lb01 (`52.56.152.51`).

**3a. Install HAProxy**

```bash
sudo apt update && sudo apt install -y haproxy
```

**3b. Add the load balancer settings (run this once)**

```bash
sudo tee -a /etc/haproxy/haproxy.cfg > /dev/null <<'EOF'

frontend http_front
    bind *:80
    default_backend web_servers

backend web_servers
    balance roundrobin
    option httpchk GET /
    server web01 16.60.136.184:80 check
    server web02 18.133.182.40:80 check
EOF
```

What it does:

| Setting | Meaning |
|---|---|
| `frontend http_front` / `bind *:80` | Accept web traffic on port 80 |
| `default_backend web_servers` | Send that traffic to the group named `web_servers` |
| `balance roundrobin` | Alternate between the servers, one request each in turn |
| `option httpchk GET /` | Health check: request `/` from each server |
| `server web01 ... check` | Web01 is a member and is health-checked |
| `server web02 ... check` | Web02 is a member and is health-checked |

**3c. Validate and start**

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl status haproxy --no-pager
```

Expected: `Configuration file is valid` and `active (running)`.

### Step 4: Test the load balancer

From Lb01 or from your own computer:

```bash
for i in 1 2 3 4 5 6; do curl -sI http://52.56.152.51/ | grep -i x-served-by; done
```

Result (the two servers alternate):

```
x-served-by: 7319-web-01
x-served-by: 7319-web-02
x-served-by: 7319-web-01
x-served-by: 7319-web-02
x-served-by: 7319-web-01
x-served-by: 7319-web-02
```

In a browser, open http://52.56.152.51/, search a city, and hard-refresh a few times (Ctrl+Shift+R). The footer switches between `7319-web-01` and `7319-web-02`.

**Failover test:** on Web01 run `sudo systemctl stop nginx`, then refresh http://52.56.152.51/. The app still works, served by Web02. Restore with `sudo systemctl start nginx`.

### Updating the app later

After pushing changes to GitHub, run this on **both** Web01 and Web02:

```bash
cd /var/www/forecast && sudo git pull
```

---

## Challenges and solutions

| Challenge | Solution |
|---|---|
| Proving that traffic is really balanced | Added an `X-Served-By` header in Nginx and showed it in the page footer |
| Several cities share one name | The geocoding API returns up to 5 matches and the user picks one |
| API timeouts or outages | Fetch wrapper with an 8-second timeout and plain-language error messages |
| Keeping secrets out of a public repo | Chose a keyless API, so there is nothing to hide |
| Repeated API calls | 10-minute response cache |
| SSH access was denied on all three servers | The servers only accepted the original key I had created in my course sandbox. I located it there and logged in with it |
| HAProxy refused to start | The config contained duplicate `frontend` and `backend` blocks. I removed the extra copy and checked with `haproxy -c` before restarting |

## Project structure

```
index.html   page structure
style.css    responsive styling (light and dark mode)
app.js       API calls, caching, sorting, filtering, error handling
README.md
.gitignore
```
