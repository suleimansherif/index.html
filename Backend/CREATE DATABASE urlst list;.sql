CREATE DATABASE urban_clients;
CREATE USER 'suleiman sheriff'@'%' IDENTIFIED BY 'sH12eri@28846';
GRANT ALL PRIVILEGES ON urlst list.* TO 'suleiman sheriff'@'%';
FLUSH PRIVILEGES;


USE urlst list;

CREATE TABLE clients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  package VARCHAR(255) NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);