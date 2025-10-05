# LinkedIn Sentiment Assistant

A smart Chrome extension that analyzes LinkedIn posts with AI-powered sentiment detection and provides automated engagement features.
<img width="339" height="250" alt="image" src="https://github.com/user-attachments/assets/9223f181-a83d-438c-8647-83d2b6898d7c" />


## 🚀 Features

- **Intelligent Sentiment Analysis**: Automatically analyzes LinkedIn posts for positive, negative, or neutral sentiment
- **Auto-Like System**: Smart auto-liking with rate limiting (1 action per 2 seconds) and toxicity filtering
- **Learning Algorithm**: Self-improving selector detection that adapts to LinkedIn's changing DOM structure
- **Comment Draft Generation**: AI-generated comment suggestions for engaging posts
- **Engagement History**: Track all liked posts with timestamps and sentiment scores
- **Data Export/Import**: Transfer learning data between browser profiles
- **Toxicity Filter**: Automatically skips harmful or inappropriate content
- **Repost Detection**: Identifies and handles reposted content appropriately

## 🧠 Smart Learning System

The extension uses machine learning to:
- Learn successful like button selectors
- Detect already-liked posts
- Identify repost indicators
- Adapt to LinkedIn's UI changes automatically

## 🛡️ Safety Features

- **Rate Limiting**: Prevents spam-like behavior with built-in delays
- **Content Filtering**: Skips toxic, harmful, or inappropriate posts
- **Manual Override**: Easy start/stop controls
- **Privacy First**: All data stored locally in your browser

## 📦 Installation

1. Clone this repository:
  
2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the extension folder

5. Navigate to LinkedIn and click the extension icon to start

## 🎯 Usage

1. **Start the Assistant**: Click the extension icon on LinkedIn
2. **Configure Settings**: Toggle auto-actions, set preferences
3. **Monitor Activity**: View real-time sentiment analysis
4. **Review History**: Check engagement history and analytics
5. **Export Data**: Save learning data for backup

## ⚙️ Configuration

### Auto-Actions
- Toggle automatic liking on/off
- Set custom rate limits
- Configure sentiment thresholds

### Learning Data
- Export trained selectors
- Import previous learning data
- Reset learning algorithm

### API Settings
- Connect custom sentiment analysis backend
- Configure toxicity filtering levels
- Set comment generation preferences

## 📊 Analytics Dashboard

- View liked post history with sentiment scores
- Track engagement patterns over time
- Monitor auto-like success rates
- Export data for external analysis

## 🔧 Development

### Prerequisites
- Chrome browser
- Basic understanding of Chrome extensions
- Optional: Custom sentiment analysis API

### File Structure
```
linkedin-assistant-ext/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js             # LinkedIn page interaction
├── popup.html             # Extension popup UI
├── popup.js               # Popup functionality
├── styles.css             # Extension styling
└── README.md              # This file
```

### Local Development
1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click the refresh icon for the extension
4. Test changes on LinkedIn

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines
- Maintain respectful automation practices
- Follow LinkedIn's Terms of Service
- Test thoroughly before submitting
- Document new features

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This extension is designed to assist with genuine engagement on LinkedIn. Please use responsibly and in accordance with LinkedIn's Terms of Service. The tool is intended for legitimate networking and professional engagement, not spam or manipulation.



## 🔄 Updates

The extension automatically adapts to LinkedIn's UI changes through its learning algorithm. Regular updates may include:
- Enhanced sentiment analysis
- New safety features
- Performance improvements
- Bug fixes

---

**Made with ❤️ for professional networking**
