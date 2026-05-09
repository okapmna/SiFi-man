// Function to open the edit modal with populated data
function editDevice(element) {
    const id = element.getAttribute('data-id');
    const typeName = element.getAttribute('data-name');
    const description = element.getAttribute('data-desc');
    
    document.getElementById('edit_device_id').value = id;
    document.getElementById('edit_type_name').value = typeName;
    document.getElementById('edit_description').value = description;
    
    var editModal = new bootstrap.Modal(document.getElementById('editDeviceModal'));
    editModal.show();
}

// Function to submit the edit form via AJAX
async function submitEditDevice(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit_device_id').value;
    const typeName = document.getElementById('edit_type_name').value;
    const description = document.getElementById('edit_description').value;
    
    try {
        const response = await fetch(`/admin/devices/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type_name: typeName,
                description: description
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Reload the page to show updated data
            window.location.reload();
        } else {
            alert('Error updating device: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while updating the device.');
    }
}

// Function to delete a device via AJAX
async function deleteDevice(id) {
    if (!confirm('Are you sure you want to delete this device type?')) {
        return;
    }
    
    try {
        const response = await fetch(`/admin/devices/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            window.location.reload();
        } else {
            alert('Error deleting device: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while deleting the device.');
    }
}
