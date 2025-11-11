document.addEventListener('DOMContentLoaded', () => {
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const confirmationContainer = document.getElementById('confirmationContainer');
    const form = document.getElementById('reclamacionForm');
    
    // --- INICIO DE LA LÓGICA DE PERSISTENCIA (VERSIÓN ROBUSTA) ---

    // 1. Seleccionamos solo los campos de texto/datos que queremos guardar y recuperar.
    const fieldsToPersist = form.querySelectorAll('input[type="text"], input[type="email"], input[type="date"], input[type="tel"], textarea');

    // 2. Función para guardar los datos en la memoria del navegador.
    const saveData = () => {
        try {
            fieldsToPersist.forEach(field => {
                localStorage.setItem(field.id, field.value);
            });
            console.log("Datos del formulario guardados en localStorage.");
        } catch (e) {
            console.error("No se pudo guardar en localStorage. Puede que el modo incógnito esté activo.", e);
        }
    };

    // 3. Función para cargar los datos al iniciar la página.
    const loadData = () => {
        try {
            fieldsToPersist.forEach(field => {
                const savedValue = localStorage.getItem(field.id);
                if (savedValue) {
                    field.value = savedValue;
                }
            });
            console.log("Datos del formulario recuperados de localStorage.");
        } catch (e) {
            console.error("No se pudo leer de localStorage.", e);
        }
    };
    
    // 4. Función para limpiar la memoria después de un envío exitoso.
    const clearData = () => {
        try {
            fieldsToPersist.forEach(field => {
                localStorage.removeItem(field.id);
            });
            console.log("localStorage limpiado.");
        } catch (e) {
            console.error("No se pudo limpiar localStorage.", e);
        }
    };

    // 5. CAMBIO CRUCIAL: Escuchamos el evento 'change' en TODOS los campos (incluidos los de archivo).
    // Esto es más fiable que 'input' y se activa al seleccionar una foto.
    const allFormElements = form.querySelectorAll('input, textarea');
    allFormElements.forEach(element => {
        element.addEventListener('change', saveData);
    });

    // 6. Al cargar la página, recuperamos cualquier dato que hubiera.
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
            
            clearData(); // Limpiamos solo si el envío es exitoso.

            loadingContainer.style.display = 'none';
            confirmationContainer.style.display = 'block';

        } catch (error) {
            console.error('Error al enviar el formulario:', error);
            alert(`Hubo un problema al enviar la reclamación: ${error.message}`);
            loadingContainer.style.display = 'none';
            formContainer.style.display = 'block';
        }
    });

    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        clearData(); // Limpiamos antes de recargar.
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