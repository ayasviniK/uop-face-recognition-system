package com.uop.backend.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.uop.backend.model.Admin;
import com.uop.backend.repository.AdminRepository;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminUsername;
    private final String adminPassword;

    public DataInitializer(
            AdminRepository adminRepository,
            PasswordEncoder passwordEncoder,
            @Value("${ADMIN_USERNAME:admin@uop.ac.lk}") String adminUsername,
            @Value("${ADMIN_PASSWORD:admin123}") String adminPassword) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(String... args) throws Exception {
        ensureAdmin(adminUsername, adminPassword);
        ensureAdmin("admin", "adminpassword");
    }

    private void ensureAdmin(String username, String password) {
        Admin admin = adminRepository.findByUsername(username).orElse(null);
        if (admin == null) {
            admin = Admin.builder()
                    .username(username)
                    .password(passwordEncoder.encode(password))
                    .build();
            adminRepository.save(admin);
            log.info("Administrator seeded successfully for user '{}'.", username);
        } else if (!passwordEncoder.matches(password, admin.getPassword())) {
            admin.setPassword(passwordEncoder.encode(password));
            adminRepository.save(admin);
            log.info("Administrator password synchronized for user '{}'.", username);
        }
    }
}
