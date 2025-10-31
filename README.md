# Portfolio Website

A complete portfolio website with backend API and modern frontend, featuring a retro space theme.

## 🚀 Features

- **Backend API**: Express.js server with JWT authentication
- **Modern Frontend**: Responsive design with retro space aesthetics
- **Admin Dashboard**: Content management system
- **Project Showcase**: Dynamic project display with filtering
- **Authentication**: Secure login system with JWT tokens
- **Database**: PostgreSQL with comprehensive schema
- **Docker Support**: Full containerization with Docker Compose

## 🛠️ Tech Stack

### Backend
- Node.js with Express.js
- JWT Authentication
- PostgreSQL Database
- Docker & Docker Compose

### Frontend
- Modern HTML5, CSS3, JavaScript
- Responsive Design
- Retro Space Theme
- RESTful API Integration

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL
- Docker (optional)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Shilohr/portfolio-website.git
   cd portfolio-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # Create database and run schema
   psql -U your_username -c "CREATE DATABASE portfolio;"
   psql -U your_username -d portfolio -f database/schema.sql
   psql -U your_username -d portfolio -f database/seeds.sql
   ```

5. **Start the application**
   ```bash
   npm start
   ```

### Docker Setup

```bash
docker-compose up -d
```

## 🌐 Access

- **Main Website**: http://localhost:8080
- **Admin Dashboard**: http://localhost:8080/admin
- **API Endpoints**: http://localhost:8080/api

## 📁 Project Structure

```
portfolio-website/
├── src/
│   └── api/
│       ├── auth.js          # Authentication routes
│       ├── github.js        # GitHub integration
│       └── server.js        # Main server file
├── public/
│   ├── index.html           # Main portfolio page
│   ├── projects.html        # Projects showcase
│   ├── admin.html           # Admin dashboard
│   ├── login.html           # Login page
│   ├── style.css            # Retro space theme styles
│   └── js/
│       ├── script.js        # Main functionality
│       ├── auth.js          # Authentication logic
│       ├── admin.js         # Admin dashboard logic
│       └── projects.js      # Projects page logic
├── database/
│   ├── schema.sql           # Database schema
│   └── seeds.sql            # Initial data
├── scripts/
│   ├── build.sh             # Build script
│   ├── deploy.sh            # Deployment script
│   └── start.sh             # Start script
├── docker-compose.yml       # Docker configuration
├── Dockerfile               # Docker image definition
└── package.json             # Dependencies and scripts
```

## 🔐 Authentication

The application uses JWT-based authentication. Default admin credentials:
- Username: `admin`
- Password: `admin123`

**Important**: Change these credentials in production!

## 🎨 Theme

The website features a modern retro space theme with:
- **Primary Colors**: Deep space blues and purples
- **Accent Colors**: Neon greens and cyans
- **Typography**: Modern sans-serif with tech-inspired styling
- **Animations**: Smooth transitions and hover effects

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get user profile

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get specific project
- `POST /api/projects` - Create new project (admin)
- `PUT /api/projects/:id` - Update project (admin)
- `DELETE /api/projects/:id` - Delete project (admin)

### GitHub Integration
- `GET /api/github/repos` - Get GitHub repositories
- `GET /api/github/user` - Get GitHub user info

## 🚀 Deployment

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**
   ```bash
   export NODE_ENV=production
   export DATABASE_URL=your_production_db_url
   export JWT_SECRET=your_production_secret
   ```

3. **Deploy using Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Manual Deployment

```bash
npm install --production
npm start
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Contact

- **GitHub**: [@Shilohr](https://github.com/Shilohr)
- **Portfolio**: https://shilohr.github.io/portfolio-website

## 🙏 Acknowledgments

- NASA for the amazing space imagery
- The open-source community for the tools and libraries
- Everyone who contributed to making this project possible

---

**Built with ❤️ and lots of ☕**