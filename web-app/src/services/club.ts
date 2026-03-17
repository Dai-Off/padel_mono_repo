import { ApiServiceWithAuth } from './api';

export interface Club {
    id: string;
    owner_id: string;
    name: string;
    fiscal_tax_id: string;
    fiscal_legal_name: string;
    description?: string;
    address: string;
    city: string;
    postal_code: string;
    lat?: number;
    lng?: number;
    base_currency: string;
    weekly_schedule: any;
    schedule_exceptions: any;
    created_at: string;
    updated_at: string;
}

class ClubService extends ApiServiceWithAuth {
    async getAll(ownerId?: string): Promise<Club[]> {
        const url = ownerId ? `/clubs?owner_id=${ownerId}` : '/clubs';
        const response = await this.get<{ clubs: Club[] }>(url);
        return response.clubs;
    }

    async getById(id: string): Promise<Club> {
        const response = await this.get<{ club: Club }>(`/clubs/${id}`);
        return response.club;
    }

    async create(data: Partial<Club>): Promise<Club> {
        const response = await this.post<{ club: Club }>('/clubs', data);
        return response.club;
    }

    async update(id: string, data: Partial<Club>): Promise<Club> {
        const response = await this.put<{ club: Club }>(`/clubs/${id}`, data);
        return response.club;
    }

    async delete(id: string): Promise<void> {
        await this.deleteRequest(`/clubs/${id}`);
    }
}

export const clubService = new ClubService();
