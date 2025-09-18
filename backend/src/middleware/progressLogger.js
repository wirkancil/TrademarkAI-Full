const EventEmitter = require('events');

class ProgressLogger extends EventEmitter {
  constructor() {
    super();
    this.activeUploads = new Map();
  }

  /**
   * Start tracking progress for a request
   * @param {string} requestId - Request ID
   * @param {object} options - Progress options
   */
  startProgress(requestId, options = {}) {
    const progress = {
      requestId,
      startTime: Date.now(),
      currentStep: 0,
      totalSteps: options.totalSteps || 5,
      stepNames: options.stepNames || [
        'File validation',
        'PDF parsing', 
        'Text chunking',
        'Embedding generation',
        'Vector storage'
      ],
      currentStepName: '',
      percentage: 0,
      estimatedTimeRemaining: null,
      status: 'started'
    };
    
    this.activeUploads.set(requestId, progress);
    
    console.log(`📊 [${requestId}] Progress tracking started:`, {
      totalSteps: progress.totalSteps,
      steps: progress.stepNames
    });
    
    this.emit('progress', progress);
    return progress;
  }

  /**
   * Update progress to next step
   * @param {string} requestId - Request ID
   * @param {string} stepName - Optional custom step name
   * @param {object} metadata - Additional metadata
   */
  nextStep(requestId, stepName = null, metadata = {}) {
    const progress = this.activeUploads.get(requestId);
    if (!progress) {
      console.warn(`⚠️ Progress not found for request: ${requestId}`);
      return null;
    }

    progress.currentStep++;
    progress.currentStepName = stepName || progress.stepNames[progress.currentStep - 1] || 'Processing';
    progress.percentage = Math.round((progress.currentStep / progress.totalSteps) * 100);
    
    // Calculate estimated time remaining
    const elapsed = Date.now() - progress.startTime;
    const avgTimePerStep = elapsed / progress.currentStep;
    const remainingSteps = progress.totalSteps - progress.currentStep;
    progress.estimatedTimeRemaining = remainingSteps > 0 ? Math.round(avgTimePerStep * remainingSteps) : 0;
    
    // Add metadata
    progress.metadata = { ...progress.metadata, ...metadata };
    
    console.log(`🔄 [${requestId}] Progress: ${progress.percentage}% - ${progress.currentStepName}`, {
      step: `${progress.currentStep}/${progress.totalSteps}`,
      elapsed: `${elapsed}ms`,
      eta: progress.estimatedTimeRemaining ? `${progress.estimatedTimeRemaining}ms` : 'N/A',
      ...metadata
    });
    
    this.emit('progress', progress);
    return progress;
  }

  /**
   * Update progress within current step
   * @param {string} requestId - Request ID
   * @param {number} subProgress - Sub-progress (0-100)
   * @param {string} message - Progress message
   */
  updateSubProgress(requestId, subProgress, message = '') {
    const progress = this.activeUploads.get(requestId);
    if (!progress) return null;

    const baseProgress = ((progress.currentStep - 1) / progress.totalSteps) * 100;
    const stepProgress = (subProgress / 100) * (100 / progress.totalSteps);
    progress.percentage = Math.round(baseProgress + stepProgress);
    
    console.log(`📈 [${requestId}] Sub-progress: ${subProgress}% - ${message}`, {
      overallProgress: `${progress.percentage}%`,
      currentStep: progress.currentStepName
    });
    
    this.emit('subProgress', { ...progress, subProgress, message });
    return progress;
  }

  /**
   * Complete progress tracking
   * @param {string} requestId - Request ID
   * @param {object} result - Final result
   */
  completeProgress(requestId, result = {}) {
    const progress = this.activeUploads.get(requestId);
    if (!progress) return null;

    const totalTime = Date.now() - progress.startTime;
    progress.percentage = 100;
    progress.status = 'completed';
    progress.completedAt = new Date().toISOString();
    progress.totalTime = totalTime;
    progress.result = result;
    
    console.log(`✅ [${requestId}] Progress completed in ${totalTime}ms:`, {
      totalSteps: progress.totalSteps,
      avgTimePerStep: `${Math.round(totalTime / progress.totalSteps)}ms`,
      ...result
    });
    
    this.emit('complete', progress);
    
    // Clean up after 5 minutes
    setTimeout(() => {
      this.activeUploads.delete(requestId);
    }, 5 * 60 * 1000);
    
    return progress;
  }

  /**
   * Mark progress as failed
   * @param {string} requestId - Request ID
   * @param {Error} error - Error object
   */
  failProgress(requestId, error) {
    const progress = this.activeUploads.get(requestId);
    if (!progress) return null;

    const totalTime = Date.now() - progress.startTime;
    progress.status = 'failed';
    progress.error = {
      message: error.message,
      code: error.code,
      stack: error.stack
    };
    progress.failedAt = new Date().toISOString();
    progress.totalTime = totalTime;
    
    console.error(`💥 [${requestId}] Progress failed after ${totalTime}ms at step ${progress.currentStep}:`, {
      step: progress.currentStepName,
      error: error.message,
      percentage: progress.percentage
    });
    
    this.emit('failed', progress);
    
    // Clean up after 1 minute for failed uploads
    setTimeout(() => {
      this.activeUploads.delete(requestId);
    }, 60 * 1000);
    
    return progress;
  }

  /**
   * Get current progress for a request
   * @param {string} requestId - Request ID
   */
  getProgress(requestId) {
    return this.activeUploads.get(requestId) || null;
  }

  /**
   * Get all active progresses
   */
  getAllProgress() {
    return Array.from(this.activeUploads.values());
  }

  /**
   * Middleware to add progress tracking to requests
   */
  middleware() {
    return (req, res, next) => {
      // Add progress methods to request object
      req.startProgress = (options) => this.startProgress(req.requestId, options);
      req.nextStep = (stepName, metadata) => this.nextStep(req.requestId, stepName, metadata);
      req.updateSubProgress = (subProgress, message) => this.updateSubProgress(req.requestId, subProgress, message);
      req.completeProgress = (result) => this.completeProgress(req.requestId, result);
      req.failProgress = (error) => this.failProgress(req.requestId, error);
      req.getProgress = () => this.getProgress(req.requestId);
      
      next();
    };
  }

  /**
   * Express route to get progress status
   */
  getProgressRoute() {
    return (req, res) => {
      const { requestId } = req.params;
      
      if (requestId) {
        const progress = this.getProgress(requestId);
        if (progress) {
          res.json({
            success: true,
            progress
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Progress not found',
            requestId
          });
        }
      } else {
        // Return all active progresses
        const allProgress = this.getAllProgress();
        res.json({
          success: true,
          activeUploads: allProgress.length,
          progresses: allProgress
        });
      }
    };
  }
}

module.exports = new ProgressLogger();