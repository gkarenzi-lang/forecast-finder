# Forecast Finder

A responsive web app that shows a 14-day weather forecast for any city. Users can search for a city, sort days (date, hottest, coldest, wettest), filter days (rain likely, mostly dry, warm), and switch between °C and °F. It helps people plan travel, events, and outdoor work.

**Tech:** HTML, CSS, vanilla JavaScript. No build step, no dependencies, no API key.

## APIs used and credits

- **Open-Meteo Forecast API** – https://open-meteo.com/en/docs
- **Open-Meteo Geocoding API** – https://open-meteo.com/en/docs/geocoding-api

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Free for non-commercial use, no key needed. Font: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (Google Fonts, OFL). Deployment stack: Nginx and HAProxy.

**API keys / credentials:** none are required, so nothing sensitive is stored in this repo. There is no login.

## Features

- City search with a pick-list when several cities match
- Sort and filter the forecast, unit toggle
- Error handling: city not found, API down, timeouts, bad responses
- Bonus: API responses cached for 10 minutes (sessionStorage), last city remembered, output escaped (textContent) against XSS
- Page footer shows which server handled the request (`Served by: web-01`)

## Run locally

```bash
git clone https://github.com/<gkarenzi-lang>/<forecast-finder>.git
cd <your-repo>
python3 -m http.server 8000      # or: npx serve
```

Open http://localhost:8000.

## Deployment

Replace `<WEB01_IP>`, `<WEB02_IP>`, `<LB01_IP>` and `<user>` with your server details. Run the Web01 steps, then repeat them on Web02.

### 1. Web01 and Web02 (Nginx)

```bash
ssh <user>@<WEB01_IP>
sudo apt update && sudo apt install -y nginx git
sudo git clone https://github.com/<your-username>/<your-repo>.git /var/www/forecast
```

Create `/etc/nginx/sites-available/forecast`:

```nginx
server {
    listen 80 default_server;
    server_name _;
    root /var/www/forecast;
    index index.html;

    # Identify which server answered (shown in the page footer)
    add_header X-Served-By $hostname always;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Enable it and reload:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/forecast /etc/nginx/sites-enabled/forecast
sudo nginx -t && sudo systemctl reload nginx
```

To update later: `cd /var/www/forecast && sudo git pull` on both servers.

### 2. Lb01 (HAProxy)

```bash
ssh <user>@<LB01_IP>
sudo apt update && sudo apt install -y haproxy
```

Append to `/etc/haproxy/haproxy.cfg`:

```haproxy
frontend http_front
    bind *:80
    default_backend web_servers

backend web_servers
    balance roundrobin
    option httpchk GET /
    server web01 <WEB01_IP>:80 check
    server web02 <WEB02_IP>:80 check
```

Validate and restart:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
```

`roundrobin` alternates requests between the servers. `check` makes HAProxy stop sending traffic to a server that is down.

### 3. Testing the load balancer

```bash
for i in 1 2 3 4 5 6; do curl -sI http://<LB01_IP>/ | grep -i x-served-by; done
```

Expected output alternates between both servers (`web-01`, `web-02`). In a browser, open `http://<LB01_IP>/`, hard-refresh a few times, and watch the **Served by** text in the footer change. Failover test: `sudo systemctl stop nginx` on Web01 and confirm the app still works through Lb01, then start it again.

## Challenges and solutions

| Challenge | Solution |
|---|---|
| Showing that traffic is really balanced | Added an `X-Served-By` header in Nginx and read it in JavaScript |
| Several cities share one name | Geocoding returns up to 5 matches and the user picks one |
| API timeouts or outages | Fetch wrapper with an 8-second timeout and plain-language error messages |
| Avoiding secrets in a public repo | Chose a keyless API |
| Repeated API calls | 10-minute response cache |

## Project structure

```
index.html   page structure
style.css    responsive styling (light and dark mode)
app.js       API calls, caching, sorting, filtering, error handling
README.md
.gitignore
```
