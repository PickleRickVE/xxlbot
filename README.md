# xxlbot
Telegram bot for automated postings of xxl showcase Pokémon.

### Prerequisites
* NodeJS
* Telegram bot ('/newbot' in a chat with the Botfather)
* working TileServer with pokemon template (e.g. https://github.com/123FLO321/SwiftTileserverCache)
* Data source like Golbat

### Installation
* Clone the source `git clone https://github.com/PickleRickVE/xxlbot.git`
* Run `npm install` to set up the project
* Add your bot to a channel in Telegram
* Copy config.js.example to config.js, edit the latter. Add your bot-token, the channel where to post, TileServer address and choose your language and filter values.
* Point a pokemon_iv webhook to http://server-ip:9999

### Running
* Run `npm start` (preferred in a tmux or screen session)

### Way of working
* The bot calculates the possible showcase score as a range for scanned mon. It considers the scanned values for iv and (calculated) weight variate of 1.55 and 1.75 class xxl mon.
