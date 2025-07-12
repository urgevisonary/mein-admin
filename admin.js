// Admin panel functionality

let allClientData = [];
let hasUnsavedChanges = false;
let isAuthenticated = false;
let currentAction = null;

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel initialized');
    setupPasswordModal();
});

// Setup password modal event listeners
function setupPasswordModal() {
    const passwordInput = document.getElementById('adminPasswordInput');

    // Add enter key support for password input
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            verifyPassword();
        }
    });

    // Clear error when typing
    passwordInput.addEventListener('input', function() {
        document.getElementById('passwordError').style.display = 'none';
    });
}

// Password protection functions
function requireAuthentication(action) {
    if (isAuthenticated) {
        executeAction(action);
        return;
    }

    currentAction = action;
    showPasswordModal();
}

function showPasswordModal() {
    const modal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('adminPasswordInput');

    modal.style.display = 'flex';
    passwordInput.value = '';
    passwordInput.focus();

    // Clear any previous errors
    document.getElementById('passwordError').style.display = 'none';
}

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    modal.style.display = 'none';
    currentAction = null;
}

async function verifyPassword() {
    const passwordInput = document.getElementById('adminPasswordInput');
    const password = passwordInput.value.trim();

    if (!password) {
        showPasswordError('Please enter password');
        return;
    }

    try {
        // Verify password against Supabase
        const isValid = await verifyPasswordWithSupabase(password);

        if (isValid) {
            isAuthenticated = true;
            closePasswordModal();

            // Log successful authentication
            await logAdminAction('admin_login');

            // Execute the pending action
            if (currentAction) {
                executeAction(currentAction);
                currentAction = null;
            }

            // Set session timeout (30 minutes)
            setTimeout(() => {
                isAuthenticated = false;
                utils.showError('Session expired. Please authenticate again for admin actions.');
            }, 30 * 60 * 1000);

        } else {
            showPasswordError('Invalid password. Please try again.');
            passwordInput.value = '';
            passwordInput.focus();
        }

    } catch (error) {
        console.error('Password verification error:', error);
        showPasswordError('Authentication failed. Please try again.');
    }
}

async function verifyPasswordWithSupabase(password) {
    try {
        // Use Supabase RPC function for secure password verification
        const { data, error } = await supabase.rpc('verify_admin_password', {
            input_password: password
        });

        if (error) {
            console.error('Password verification error:', error);
            return false;
        }

        return data === true;

    } catch (error) {
        console.error('Password verification failed:', error);
        return false;
    }
}

function showPasswordError(message) {
    const errorEl = document.getElementById('passwordError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function executeAction(action) {
    switch (action) {
        case 'loadData':
            loadAllDataInternal();
            logAdminAction('data_load');
            break;
        case 'addRecord':
            showAddRecordFormInternal();
            logAdminAction('add_record_form_opened');
            break;
        default:
            console.error('Unknown action:', action);
    }
}

// Audit logging function
async function logAdminAction(actionName) {
    try {
        await supabase.rpc('log_admin_action', {
            action_name: actionName
        });
    } catch (error) {
        // Silent fail for audit logging to not interrupt user experience
        console.warn('Audit logging failed:', error);
    }
}





// Process Excel file
async function processExcelFile() {
    if (!currentExcelData) {
        utils.showError('No file selected', 'uploadResults');
        return;
    }
    
    showProgress(true, 'Reading Excel file...');
    
    try {
        let jsonData;

        // Check if it's a CSV file
        if (currentExcelData.name.toLowerCase().endsWith('.csv')) {
            // Read CSV file
            const text = await currentExcelData.text();
            const lines = text.split('\n').filter(line => line.trim());
            jsonData = lines.map(line => {
                // Handle CSV parsing with proper comma handling
                const result = [];
                let current = '';
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            });
        } else {
            // Read Excel file
            const arrayBuffer = await currentExcelData.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            // Get first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON
            jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        }

        if (jsonData.length < 2) {
            throw new Error('File must contain at least a header row and one data row');
        }
        
        updateProgress(25, 'Processing data...');
        
        // Process the data
        const headers = jsonData[0];
        const dataRows = jsonData.slice(1);

        // Debug: Log headers to console
        console.log('Excel headers:', headers);

        // Define valid database columns
        const validColumns = ['unique_id', 'building_name', 'unit_no', 'client_name', 'contract_date', 'model', 'area_size', 'sale_value', 'received_amount', 'rcv_percentage', 'pdc', 'balance'];

        // Map data to our schema
        const processedData = dataRows.map((row, index) => {
            const record = {};

            headers.forEach((header, colIndex) => {
                if (!header) return; // Skip empty headers

                // Get mapped field name
                let mappedField = COLUMN_MAPPINGS[header];

                // If no direct mapping, create one from header
                if (!mappedField) {
                    mappedField = header.toString().toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_|_$/g, '');
                }

                // Only process if it's a valid column
                if (!validColumns.includes(mappedField)) {
                    return;
                }

                let value = row[colIndex];

                // Handle special data types
                if (mappedField === 'contract_date' && value) {
                    // Try to parse date - handle MM/DD/YYYY format
                    let date;
                    if (value.includes('/')) {
                        const parts = value.split('/');
                        if (parts.length === 3) {
                            // Assume MM/DD/YYYY format
                            date = new Date(parts[2], parts[0] - 1, parts[1]);
                        }
                    } else {
                        date = new Date(value);
                    }

                    if (date && !isNaN(date.getTime())) {
                        value = date.toISOString().split('T')[0];
                    } else {
                        value = null;
                    }
                }

                // Handle numeric fields
                if (['sale_value', 'received_amount', 'rcv_percentage', 'pdc', 'balance'].includes(mappedField) && value) {
                    // Remove commas, quotes, and other non-numeric characters except decimal point and minus
                    const cleanValue = value.toString().replace(/["',]/g, '').replace(/[^0-9.-]/g, '');
                    const numValue = parseFloat(cleanValue);
                    value = isNaN(numValue) ? null : numValue;
                }

                // Only set non-empty values
                if (value !== undefined && value !== null && value !== '') {
                    record[mappedField] = value;
                }
            });

            // Generate unique_id if not present
            if (!record.unique_id) {
                record.unique_id = `ID${String(index + 1).padStart(4, '0')}`;
            }

            return record;
        }).filter(record => Object.keys(record).length > 1); // Filter out empty records
        
        updateProgress(50, 'Uploading to database...');

        // Debug: Log processed data
        console.log('Processed data sample:', processedData.slice(0, 3));
        console.log('Total records to upload:', processedData.length);

        if (processedData.length === 0) {
            throw new Error('No valid data found in the Excel file. Please check the file format.');
        }

        // Upload to Supabase
        await uploadToSupabase(processedData);

        updateProgress(100, 'Complete!');

        // Show success message
        document.getElementById('uploadResults').innerHTML = `
            <div class="success-message" style="display: block;">
                Successfully processed ${processedData.length} records!
            </div>
        `;
        
        // Clear file after successful upload
        setTimeout(() => {
            clearFile();
        }, 3000);
        
    } catch (error) {
        console.error('Processing error:', error);
        utils.showError(`Error processing file: ${error.message}`, 'uploadResults');
        showProgress(false);
    }
}

// Upload data to Supabase
async function uploadToSupabase(data) {
    const batchSize = 50; // Smaller batch size for better error handling
    let processed = 0;
    let errors = [];

    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        try {
            // Debug: Log batch data
            console.log(`Uploading batch ${Math.floor(i/batchSize) + 1}, records ${i+1} to ${Math.min(i + batchSize, data.length)}`);
            console.log('Batch sample:', batch[0]);

            // Use upsert to handle duplicates
            const { error } = await supabase
                .from(TABLE_NAME)
                .upsert(batch, {
                    onConflict: 'unique_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Supabase error:', error);
                errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);

                // Try individual inserts for this batch
                for (const record of batch) {
                    try {
                        const { error: singleError } = await supabase
                            .from(TABLE_NAME)
                            .upsert([record], {
                                onConflict: 'unique_id',
                                ignoreDuplicates: false
                            });

                        if (!singleError) {
                            processed++;
                        } else {
                            console.error('Single record error:', singleError, record);
                        }
                    } catch (singleErr) {
                        console.error('Single record exception:', singleErr, record);
                    }
                }
            } else {
                processed += batch.length;
            }

        } catch (batchError) {
            console.error('Batch error:', batchError);
            errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);
        }

        const progress = 50 + (Math.min(i + batchSize, data.length) / data.length) * 50;
        updateProgress(progress, `Processed ${Math.min(i + batchSize, data.length)}/${data.length} records...`);
    }

    if (errors.length > 0) {
        console.warn('Upload completed with errors:', errors);
        if (processed === 0) {
            throw new Error(`Upload failed: ${errors[0]}`);
        }
    }

    return { processed, errors };
}

// Progress functions
function showProgress(show, text = 'Processing...') {
    const progressSection = document.getElementById('uploadProgress');
    progressSection.style.display = show ? 'block' : 'none';
    
    if (show) {
        updateProgress(0, text);
    }
}

function updateProgress(percent, text) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = text;
}

// Protected wrapper functions
function loadAllData() {
    requireAuthentication('loadData');
}

function showAddRecordForm() {
    requireAuthentication('addRecord');
}

// Internal functions (called after authentication)
async function loadAllDataInternal() {
    try {
        // Show loading state
        const loadBtn = document.querySelector('.load-btn');
        const originalText = loadBtn.textContent;
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';

        // First get total count
        const { count, error: countError } = await supabase
            .from(TABLE_NAME)
            .select('*', { count: 'exact', head: true });

        if (countError) {
            throw countError;
        }

        console.log(`Total records in database: ${count}`);

        // Load all data in batches to avoid timeout
        allClientData = [];
        const batchSize = 1000;
        let offset = 0;

        while (offset < count) {
            console.log(`Loading batch: ${offset + 1} to ${Math.min(offset + batchSize, count)}`);

            const { data: batchData, error } = await supabase
                .from(TABLE_NAME)
                .select('*')
                .order('id')
                .range(offset, offset + batchSize - 1);

            if (error) {
                throw error;
            }

            allClientData = allClientData.concat(batchData || []);
            offset += batchSize;

            // Update progress
            const progress = Math.min((offset / count) * 100, 100);
            loadBtn.textContent = `Loading... ${Math.round(progress)}%`;
        }

        console.log(`Loaded ${allClientData.length} records total`);

        displayDataTable(allClientData);
        document.getElementById('recordCount').textContent = `${allClientData.length} records loaded`;

        // Show search bar when data is loaded
        document.getElementById('tableSearchContainer').style.display = 'flex';
        setupTableSearch();

        // Reset button
        loadBtn.disabled = false;
        loadBtn.textContent = originalText;

    } catch (error) {
        console.error('Load data error:', error);
        utils.showError('Failed to load data. Please try again.');

        // Reset button on error
        const loadBtn = document.querySelector('.load-btn');
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load All Data';
    }
}

// Display data in editable table
function displayDataTable(data) {
    const container = document.getElementById('dataTableContainer');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="no-data">No data found</p>';
        return;
    }

    console.log(`Displaying ${data.length} records in table`);

    // Get all unique columns from the data
    const columns = ['id', 'unique_id', 'building_name', 'unit_no', 'client_name', 'contract_date', 'model', 'area_size', 'sale_value', 'received_amount', 'balance'];

    // Create table header
    let tableHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    ${columns.map(col => `<th>${col.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
                    <th>ACTIONS</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Build rows in chunks to avoid browser freeze
    const chunkSize = 100;
    let currentChunk = 0;

    function addChunk() {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, data.length);

        for (let i = start; i < end; i++) {
            const row = data[i];
            tableHTML += '<tr>';
            columns.forEach(col => {
                const value = row[col] || '';
                const isEditable = col !== 'id' && col !== 'created_at' && col !== 'updated_at';

                if (isEditable) {
                    tableHTML += `<td class="editable-cell" contenteditable="true" data-row="${i}" data-field="${col}">${value}</td>`;
                } else {
                    tableHTML += `<td>${value}</td>`;
                }
            });
            tableHTML += `<td><button onclick="deleteRow(${row.id})" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Delete</button></td>`;
            tableHTML += '</tr>';
        }

        currentChunk++;

        if (end < data.length) {
            // Process next chunk after a small delay
            setTimeout(addChunk, 10);
        } else {
            // Finished processing all data
            tableHTML += '</tbody></table>';
            container.innerHTML = tableHTML;

            // Add event listeners for editable cells
            setupEditableCells();
            console.log('Table rendering completed');
        }
    }

    // Start processing chunks
    addChunk();
}

// Setup editable cell functionality
function setupEditableCells() {
    document.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('input', function() {
            hasUnsavedChanges = true;
            document.getElementById('saveAllBtn').disabled = false;
            
            const rowIndex = this.dataset.row;
            const field = this.dataset.field;
            const newValue = this.textContent.trim();
            
            // Update the data array
            allClientData[rowIndex][field] = newValue;
        });
    });
}

// Save all changes
async function saveAllChanges() {
    if (!hasUnsavedChanges) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert(allClientData, { onConflict: 'id' });
        
        if (error) {
            throw error;
        }
        
        hasUnsavedChanges = false;
        document.getElementById('saveAllBtn').disabled = true;
        
        // Show success message
        utils.showSuccess('All changes saved successfully!');
        
    } catch (error) {
        console.error('Save error:', error);
        utils.showError('Failed to save changes. Please try again.');
    }
}

// Delete a row
async function deleteRow(id) {
    if (!confirm('Are you sure you want to delete this record?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', id);
        
        if (error) {
            throw error;
        }
        
        // Reload data
        await loadAllData();
        
        utils.showSuccess('Record deleted successfully!');
        
    } catch (error) {
        console.error('Delete error:', error);
        utils.showError('Failed to delete record. Please try again.');
    }
}

// Table search functionality
function setupTableSearch() {
    const searchInput = document.getElementById('tableSearchInput');

    // Add event listener for real-time search
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        filterTableData(searchTerm);
    });

    // Add enter key support
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const searchTerm = this.value.toLowerCase().trim();
            filterTableData(searchTerm);
        }
    });
}

function filterTableData(searchTerm) {
    const table = document.querySelector('.data-table');
    const rows = table.querySelectorAll('tbody tr');
    const resultsCount = document.getElementById('searchResultsCount');

    if (!searchTerm) {
        // Show all rows if search is empty
        rows.forEach(row => {
            row.style.display = '';
            row.classList.remove('search-match-row');
            // Remove highlights
            row.querySelectorAll('.search-highlight').forEach(cell => {
                cell.classList.remove('search-highlight');
            });
        });
        resultsCount.textContent = '';
        return;
    }

    let matchCount = 0;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        let rowMatches = false;

        // Remove previous highlights
        cells.forEach(cell => {
            cell.classList.remove('search-highlight');
        });
        row.classList.remove('search-match-row');

        // Check each cell for matches
        cells.forEach(cell => {
            const cellText = cell.textContent.toLowerCase();
            if (cellText.includes(searchTerm)) {
                rowMatches = true;
                // Highlight matching text
                highlightText(cell, searchTerm);
            }
        });

        if (rowMatches) {
            row.style.display = '';
            row.classList.add('search-match-row');
            matchCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Update results count
    resultsCount.textContent = `${matchCount} result${matchCount !== 1 ? 's' : ''} found`;
}

function highlightText(element, searchTerm) {
    const text = element.textContent;
    const lowerText = text.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase();

    if (lowerText.includes(lowerSearchTerm)) {
        element.classList.add('search-highlight');
    }
}

function clearTableSearch() {
    const searchInput = document.getElementById('tableSearchInput');
    searchInput.value = '';
    filterTableData('');
}

// Add new record functionality (internal)
function showAddRecordFormInternal() {
    const form = document.getElementById('addRecordForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';

    if (form.style.display === 'block') {
        // Clear form
        clearAddRecordForm();
        // Focus on first input
        document.getElementById('newClientName').focus();
    }
}

function cancelAddRecord() {
    document.getElementById('addRecordForm').style.display = 'none';
    clearAddRecordForm();
}

function clearAddRecordForm() {
    const inputs = document.querySelectorAll('#addRecordForm input');
    inputs.forEach(input => input.value = '');
}

async function addNewRecord() {
    try {
        // Get form data
        const formData = {
            unique_id: document.getElementById('newUniqueId').value.trim() || generateUniqueId(),
            client_name: document.getElementById('newClientName').value.trim(),
            building_name: document.getElementById('newBuildingName').value.trim(),
            unit_no: document.getElementById('newUnitNo').value.trim(),
            model: document.getElementById('newModel').value.trim(),
            area_size: document.getElementById('newAreaSize').value.trim(),
            contract_date: document.getElementById('newContractDate').value,
            sale_value: parseFloat(document.getElementById('newSaleValue').value) || 0,
            received_amount: parseFloat(document.getElementById('newReceivedAmount').value) || 0,
            pdc: parseFloat(document.getElementById('newPdc').value) || 0
        };

        // Calculate balance
        formData.balance = formData.sale_value - formData.received_amount;

        // Calculate received percentage
        if (formData.sale_value > 0) {
            formData.rcv_percentage = ((formData.received_amount / formData.sale_value) * 100).toFixed(2);
        } else {
            formData.rcv_percentage = 0;
        }

        // Validate required fields
        if (!formData.client_name) {
            utils.showError('Client Name is required');
            return;
        }

        // Check if unique_id already exists
        const { data: existingData } = await supabase
            .from(TABLE_NAME)
            .select('unique_id')
            .eq('unique_id', formData.unique_id)
            .single();

        if (existingData) {
            utils.showError('Unique ID already exists. Please use a different ID.');
            return;
        }

        // Insert new record
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .insert([formData])
            .select();

        if (error) {
            throw error;
        }

        // Add to local data array
        allClientData.push(data[0]);

        // Refresh table display
        displayDataTable(allClientData);

        // Update record count
        document.getElementById('recordCount').textContent = `${allClientData.length} records loaded`;

        // Hide form and clear
        cancelAddRecord();

        utils.showSuccess('Record added successfully!');

    } catch (error) {
        console.error('Add record error:', error);
        utils.showError('Failed to add record. Please try again.');
    }
}

function generateUniqueId() {
    // Generate unique ID in format: U + timestamp + random
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `U${timestamp}${random}`;
}
