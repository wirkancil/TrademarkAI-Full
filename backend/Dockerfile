FROM python:3.10

WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
# We install dependencies first to leverage Docker layer caching
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]