import { db } from './db';
import { institutional_credentials } from '@shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';

export interface CredentialNotification {
  id: number;
  credential_type: string;
  credential_name?: string | null;
  username?: string | null;
  expiration_date: string;
  days_until_expiration: number;
  urgency_level: 'high' | 'medium' | 'low';
}

export class NotificationSystem {
  // Verificar credenciales próximas a vencer
  static async checkExpiringCredentials(userId: number, campusId: number): Promise<CredentialNotification[]> {
    try {
      const today = new Date();
      const warningDate = new Date();
      warningDate.setDate(today.getDate() + 15); // 15 días de anticipación

      const expiringCredentials = await db
        .select({
          id: institutional_credentials.id,
          credential_type: institutional_credentials.credential_type,
          credential_name: institutional_credentials.credential_name,
          username: institutional_credentials.username,
          expiration_date: institutional_credentials.expiration_date,
        })
        .from(institutional_credentials)
        .where(
          and(
            eq(institutional_credentials.user_id, userId),
            eq(institutional_credentials.campus_id, campusId),
            eq(institutional_credentials.is_active, true),
            sql`${institutional_credentials.expiration_date} <= ${warningDate.toISOString().split('T')[0]}`
          )
        );

      return expiringCredentials
        .filter(cred => cred.expiration_date)
        .map(cred => {
          const expirationDate = new Date(cred.expiration_date!);
          const timeDiff = expirationDate.getTime() - today.getTime();
          const daysUntilExpiration = Math.ceil(timeDiff / (1000 * 3600 * 24));
          
          let urgency_level: 'high' | 'medium' | 'low' = 'low';
          if (daysUntilExpiration <= 3) urgency_level = 'high';
          else if (daysUntilExpiration <= 7) urgency_level = 'medium';

          return {
            id: cred.id,
            credential_type: cred.credential_type,
            credential_name: cred.credential_name,
            username: cred.username,
            expiration_date: cred.expiration_date!,
            days_until_expiration: daysUntilExpiration,
            urgency_level
          };
        })
        .sort((a, b) => a.days_until_expiration - b.days_until_expiration);
    } catch (error) {
      console.error('Error checking expiring credentials:', error);
      return [];
    }
  }

  // Marcar notificación como vista
  static async markNotificationSeen(credentialId: number): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      await db
        .update(institutional_credentials)
        .set({ last_notification_sent: today })
        .where(eq(institutional_credentials.id, credentialId));
    } catch (error) {
      console.error('Error marking notification as seen:', error);
    }
  }

  // Obtener estadísticas de notificaciones
  static async getNotificationStats(userId: number, campusId: number) {
    try {
      const notifications = await this.checkExpiringCredentials(userId, campusId);
      
      return {
        total: notifications.length,
        high_urgency: notifications.filter(n => n.urgency_level === 'high').length,
        medium_urgency: notifications.filter(n => n.urgency_level === 'medium').length,
        low_urgency: notifications.filter(n => n.urgency_level === 'low').length,
        expired: notifications.filter(n => n.days_until_expiration < 0).length
      };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      return { total: 0, high_urgency: 0, medium_urgency: 0, low_urgency: 0, expired: 0 };
    }
  }

  // Formatear nombre del tipo de credencial
  static formatCredentialType(type: string): string {
    const types: Record<string, string> = {
      'firma_electronica': 'Firma Electrónica',
      'sellos_digitales': 'Sellos Digitales',
      'idse': 'IDSE',
      'tarjeta_patronal': 'Tarjeta Patronal',
      'infonavit': 'INFONAVIT',
      'otra': 'Otra'
    };
    return types[type] || type;
  }
}