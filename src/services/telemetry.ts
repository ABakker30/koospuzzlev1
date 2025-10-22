// Telemetry Service - Track user interactions and events
//
// Simple event tracking system for analytics and monitoring
// Can be extended to integrate with analytics platforms (GA, Mixpanel, etc.)

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private isDebug = import.meta.env.DEV || import.meta.env.MODE === 'development';

  /**
   * Track an event with optional properties
   */
  track(eventName: string, properties?: Record<string, any>) {
    const event: TelemetryEvent = {
      name: eventName,
      properties,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);

    // Log in development mode
    if (this.isDebug) {
      console.log(`[Telemetry] ${eventName}`, properties || '');
    }

    // TODO: Send to analytics platform in production
    // Example: window.gtag?.('event', eventName, properties);
    // Example: window.mixpanel?.track(eventName, properties);
  }

  /**
   * Get all tracked events (for debugging)
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Clear all tracked events
   */
  clear() {
    this.events = [];
  }
}

// Singleton instance
export const telemetry = new TelemetryService();

// AI Help specific events
export const aiHelpTelemetry = {
  opened: (source: string) => {
    telemetry.track('ai_help_opened', { entry_source: source });
  },
  
  questionSuggestedClicked: (promptText: string) => {
    telemetry.track('ai_help_question_suggested_clicked', { prompt_text: promptText });
  },
  
  intentDetected: (intent: string) => {
    telemetry.track('ai_help_intent_detected', { intent });
  },
  
  answerShown: (routeTo: string) => {
    telemetry.track('ai_help_answer_shown', { route_to: routeTo });
  },
  
  followupClicked: (followupId: string) => {
    telemetry.track('ai_help_followup_clicked', { followup_id: followupId });
  },
};
