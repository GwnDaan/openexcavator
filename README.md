# openexcavator

## About
The application is intended to be used with a high precision GPS receiver for assisting excavation operations (assist with bucket positioning for land leveling, trenching).  
It is designed to run on a Raspberry Pi (but can run on other devices as well) and present a web interface used by the operator on a smartphone / tablet / notebook PC.

## Installation
Install dependencies (use `sudo apt-get install python-pip python-dev` if you don't have pip installed:
```
pip install -r requirements.txt
```
Login as the `www-data` user and copy source files
```
sudo -u www-data -s /bin/bash #login
cd /var/www
git clone https://github.com/dkwiebe/openexcavator
python openexcavator/database.py #initialize database entries
exit #logout
```
To enable the application to start at boot copy the `openexcavator.service` systemd file from the `scripts` folder to `/etc/systemd/system` and enable it using:
```
sudo cp /var/www/openexcavator/scripts/openexcavator.service /etc/systemd/system/
sudo systemctl daemon-reload  
sudo systemctl enable openexcavator
sudo systemctl start openexcavator
```
Check the logs to be sure the application is working as expected:
```
journalctl -f -u openexcavator
```
While not strictly necessary it's a good idea to put `nginx` in front of the web application:
```
sudo apt-get install nginx
```
Afterwards edit `/etc/nginx/sites-available/default`:
```
server {
        listen 80 default_server;
        location / {
                proxy_pass http://127.0.0.1:8000;
        }
        location /static/ {
            root /var/www/openexcavator;
        	sendfile off;
			tcp_nopush off;
			tcp_nodelay on;
            access_log off;
        }
}
```

### IMU
To integrate the IMU data as well, you need to install the applications from the `scripts` folder.  
First install the Emlid IMU package from `https://github.com/87yj/EmlidIMU/` by following the instructions from the `Reach IMU setup.pdf` document.  
Afterwards copy the Python scripts (`imu_reader.py` and `imu_server.py`) into the destination folder `/imu/RTIMULib2/Linux/python/tests` and copy the systemd service definitions (`imu_reader.service` and `imu_server.service`) to `/etc/systemd/system/`.  
You can now enable and start the services after which you should see IMU data (roll, pitch and yaw) in the web application (make sure the IMU host and port settings in the web application point to the correct host).
