# SIMPLE AND ETHICAL USER TRACKING

I am very interested in how amny people are actually using my app. Vercel's analitics are somewhat limited. I want to add user tracking to my app, but I want to remain within the law in my country - Norway.

As I understand it I can track people using my app, but I cannot store the entire IP address, or full postal address etc. I want the backend to check the IP connecting, run a quick location check, then store the IP like this: 192.168.**_._** or similar, and also store the approximate location. Postal code and town/city, together with the time/date. This each time a new file is uploaded or something.

I am thinkiing a simple database, for example Monogo DB which is free. Then making a completely seperate app to view the stats, unconnected to this app.
