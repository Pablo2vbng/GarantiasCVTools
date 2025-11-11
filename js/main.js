document.addEventListener('DOMContentLoaded', () => {
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const confirmationContainer = document.getElementById('confirmationContainer');
    const form = document.getElementById('reclamacionForm');
    
    // --- INICIO DE LA LÓGICA DE PERSISTENCIA ---
    // Seleccionamos todos los campos que queremos guardar
    const formFields = form.querySelectorAll('input[type="text"], input[type="email"], input[type="date"], input[type="tel"], textarea');

    // Función para guardar los datos en localStorage
    const saveData = () => {
        formFields.forEach(field => {
            localStorage.setItem(field.id, field.value);
        });
    };

    // Función para cargar los datos desde localStorage
    const loadData = () => {
        formFields.forEach(field => {
            const savedValue = localStorage.getItem(field.id);
            if (savedValue) {
                field.value = savedValue;
            }
        });
    };
    
    // Función para borrar los datos guardados
    const clearData = () => {
        formFields.forEach(field => {
            localStorage.removeItem(field.id);
        });
    };

    // Cada vez que el usuario escribe algo, guardamos los datos
    formFields.forEach(field => {
        field.addEventListener('input', saveData);
    });

    // Al cargar la página, intentamos recuperar los datos
    loadData();
    // --- FIN DE LA LÓGICA DE PERSISTENCIA ---

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        formContainer.style.display = 'none';
        loadingContainer.style.display = 'block';

        const formData = new FormData(form);
        
        try {
            const response = await fetch('/.netlify/functions/procesarGarantia', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Error desconocido en el servidor.');
            }
            
            // Si el envío es exitoso, borramos los datos guardados
            clearData();

            loadingContainer.style.display = 'none';
            confirmationContainer.style.display = 'block';

        } catch (error) {
            console.error('Error al enviar el formulario:', error);
            alert(`Hubo un problema al enviar la reclamación: ${error.message}`);
            // Si hay un error, no borramos los datos para que el usuario no los pierda
            loadingContainer.style.display = 'none';
            formContainer.style.display = 'block';
        }
    });

    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        // Al crear una nueva reclamación, borramos los datos antes de recargar
        clearData();
        window.location.reload();
    });

    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', (event) => {
            const successMessage = event.target.closest('.input-ejemplo').querySelector('.upload-success-message');
            successMessage.style.display = event.target.files.length > 0 ? 'inline' : 'none';
        });
    });
});