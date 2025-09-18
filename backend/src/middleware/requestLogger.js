const fs = require('fs').promises;
const path = require('path');

/**
 * Request logging middleware
 * Logs all HTTP requests with detailed information
 */
class RequestLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      await fs.access(this.logDir);
    } catch (error) {
      await fs.mkdir(this.logDir, { recursive: true });
      console.log(`📁 Created log directory: ${this.logDir}`);
    }
  }

  /**
   * Get client IP address
   */
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           'unknown';
  }

  /**
   * Get user agent info
   */
  getUserAgent(req) {
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Extract browser and OS info
    let browser = 'unknown';
    let os = 'unknown';
    
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';
    
    return { userAgent, browser, os };
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Main logging middleware
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      
      // Add request ID to request object for use in other parts of the app
      req.requestId = requestId;
      
      // Get request details
      const clientIP = this.getClientIP(req);
      const userAgentInfo = this.getUserAgent(req);
      const contentLength = req.get('Content-Length');
      const contentType = req.get('Content-Type');
      
      // Log request start
      const requestInfo = {
        requestId,
        timestamp,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        query: req.query,
        clientIP,
        userAgent: userAgentInfo.userAgent,
        browser: userAgentInfo.browser,
        os: userAgentInfo.os,
        contentLength: contentLength ? this.formatFileSize(parseInt(contentLength)) : null,
        contentType,
        headers: {
          host: req.get('Host'),
          referer: req.get('Referer'),
          origin: req.get('Origin'),
          accept: req.get('Accept'),
          acceptLanguage: req.get('Accept-Language'),
          acceptEncoding: req.get('Accept-Encoding')
        }
      };
      
      console.log(`🌐 [${requestId}] ${req.method} ${req.originalUrl || req.url} - Request started`);
      console.log(`📋 [${requestId}] Client info:`, {
        ip: clientIP,
        browser: userAgentInfo.browser,
        os: userAgentInfo.os,
        contentLength: requestInfo.contentLength
      });
      
      // Special logging for file uploads
      if (req.method === 'POST' && req.originalUrl?.includes('/upload')) {
        console.log(`📤 [${requestId}] File upload detected - monitoring progress...`);
      }
      
      // Override res.end to capture response details
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Log response details
        const responseInfo = {
          requestId,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          responseTime,
          responseSize: res.get('Content-Length') || (chunk ? chunk.length : 0),
          contentType: res.get('Content-Type')
        };
        
        // Determine log level based on status code
        let logLevel = '✅';
        if (res.statusCode >= 400 && res.statusCode < 500) logLevel = '⚠️';
        else if (res.statusCode >= 500) logLevel = '❌';
        
        console.log(`${logLevel} [${requestId}] ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} ${res.statusMessage} (${responseTime}ms)`);
        
        if (responseTime > 5000) {
          console.warn(`🐌 [${requestId}] Slow response detected: ${responseTime}ms`);
        }
        
        if (res.statusCode >= 400) {
          console.error(`💥 [${requestId}] Error response:`, {
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            url: req.originalUrl || req.url,
            method: req.method,
            clientIP,
            userAgent: userAgentInfo.browser
          });
        }
        
        // Special logging for successful uploads
        if (req.method === 'POST' && req.originalUrl?.includes('/upload') && res.statusCode === 201) {
          console.log(`🎉 [${requestId}] File upload completed successfully in ${responseTime}ms`);
        }
        
        // Call original end method
        originalEnd.call(this, chunk, encoding);
      };
      
      next();
    };
  }

  /**
   * Error logging middleware
   */
  errorMiddleware() {
    return (error, req, res, next) => {
      const requestId = req.requestId || 'unknown';
      const timestamp = new Date().toISOString();
      
      console.error(`💥 [${requestId}] Unhandled error at ${timestamp}:`, {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl || req.url,
        method: req.method,
        clientIP: this.getClientIP(req),
        userAgent: req.get('User-Agent')
      });
      
      // Don't expose internal errors to client
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          requestId,
          timestamp
        });
      }
      
      next(error);
    };
  }
}

module.exports = new RequestLogger();