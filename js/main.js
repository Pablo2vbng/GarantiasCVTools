document.addEventListener('DOMContentLoaded', () => {
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const confirmationContainer = document.getElementById('confirmationContainer');
    const form = document.getElementById('reclamacionForm');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        formContainer.style.display = 'none';
        loadingContainer.style.display = 'block';

        const formData = new FormData(form);
        
        try {
            // La URL de la función es siempre '/.netlify/functions/' + nombre del archivo JS
            const response = await fetch('/.netlify/functions/enviarReclamacion', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                // Si hay un error, lo mostramos en el alert
                throw new Error(result.message || 'Error desconocido en el servidor.');
            }

            // Si todo va bien, mostramos la pantalla de éxito
            loadingContainer.style.display = 'none';
            confirmationContainer.style.display = 'block';

        } catch (error) {
            console.error('Error al enviar el formulario:', error);
            alert(`Hubo un problema al enviar la reclamación: ${error.message}`);
            // Devolvemos al usuario al formulario si hay un error
            loadingContainer.style.display = 'none';
            formContainer.style.display = 'block';
        }
    });

    // Botón para reiniciar y crear otra reclamación
    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        window.location.reload();
    });

    // Feedback visual al seleccionar un archivo
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', (event) => {
            const successMessage = event.target.closest('.input-ejemplo').querySelector('.upload-success-message');
            successMessage.style.display = event.target.files.length > 0 ? 'inline' : 'none';
        });
    });
});