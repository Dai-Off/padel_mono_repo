import { ApiService } from './api';

export interface ClubOwner {
    id: string;
    name: string;
    email: string;
    phone?: string;
    stripe_connect_account_id: string;
    kyc_status: 'pending' | 'verified' | 'rejected';
    status: 'active' | 'inactive' | 'deleted';
    created_at: string;
    updated_at: string;
}

class ClubOwnerService extends ApiService {
    async getAll(): Promise<ClubOwner[]> {
        const response = await this.get<{ club_owners: ClubOwner[] }>('/club-owners');
        return response.club_owners;
    }

    async getById(id: string): Promise<ClubOwner> {
        const response = await this.get<{ club_owner: ClubOwner }>(`/club-owners/${id}`);
        return response.club_owner;
    }

    async create(data: Partial<ClubOwner>): Promise<ClubOwner> {
        const response = await this.post<{ club_owner: ClubOwner }>('/club-owners', data);
        return response.club_owner;
    }

    async update(id: string, data: Partial<ClubOwner>): Promise<ClubOwner> {
        const response = await this.put<{ club_owner: ClubOwner }>(`/club-owners/${id}`, data);
        return response.club_owner;
    }

    async delete(id: string): Promise<void> {
        await this.deleteRequest(`/club-owners/${id}`);
    }
}

export const clubOwnerService = new ClubOwnerService();
