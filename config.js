// Supabase Configuration
const SUPABASE_URL = 'https://iohniquthzgvbsqzxyji.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvaG5pcXV0aHpndmJzcXp4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMjc4ODksImV4cCI6MjA2NzkwMzg4OX0.BTp-yE53cMSlwbTmX6RP_92do0gvWOB5ua6xMxLL7uo';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Table name
const TABLE_NAME = 'client_data';

// Column mappings for Excel/CSV import
const COLUMN_MAPPINGS = {
    'Building Name': 'building_name',
    'Unit No': 'unit_no',
    'Client Name': 'client_name',
    'Contract Date': 'contract_date',
    'Model': 'model',
    'Area Size': 'area_size',
    'Sale Value ': 'sale_value',
    'Sale Value': 'sale_value',
    'Received amount': 'received_amount',
    'RCV Percentage': 'rcv_percentage',
    'PDC': 'pdc',
    'Balance ': 'balance',
    'Balance': 'balance',
    'UNIQUE ID': 'unique_id',
    'Unique ID': 'unique_id',
    // Lowercase variations
    'building_name': 'building_name',
    'unit_no': 'unit_no',
    'client_name': 'client_name',
    'contract_date': 'contract_date',
    'model': 'model',
    'area_size': 'area_size',
    'sale_value': 'sale_value',
    'received_amount': 'received_amount',
    'rcv_percentage': 'rcv_percentage',
    'pdc': 'pdc',
    'balance': 'balance',
    'unique_id': 'unique_id'
};

// Utility functions
const utils = {
    showError: (message, elementId = 'errorMessage') => {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    },

    showSuccess: (message, elementId = 'successMessage') => {
        const successEl = document.getElementById(elementId);
        if (successEl) {
            successEl.textContent = message;
            successEl.style.display = 'block';
            setTimeout(() => {
                successEl.style.display = 'none';
            }, 3000);
        }
    },

    formatDate: (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch {
            return dateString;
        }
    },

    formatCurrency: (amount) => {
        if (!amount && amount !== 0) return 'N/A';
        return new Intl.NumberFormat('en-AE', {
            style: 'currency',
            currency: 'AED'
        }).format(amount);
    },

    formatTextCurrency: (amount) => {
        if (!amount || amount === '0' || amount === 'N/A') return 'N/A';
        // Remove any existing currency symbols and clean the text
        const cleanAmount = amount.toString().replace(/[^\d.,]/g, '');
        if (!cleanAmount || cleanAmount === '0') return 'N/A';

        // Add AED currency symbol and proper formatting
        return 'AED ' + cleanAmount;
    },

    formatDateTime: (dateTimeString) => {
        if (!dateTimeString) return 'N/A';
        try {
            const date = new Date(dateTimeString);
            return date.toLocaleString();
        } catch {
            return dateTimeString;
        }
    },

    sanitizeInput: (input) => {
        if (typeof input !== 'string') return input;
        return input.trim().replace(/[<>]/g, '');
    }
};
