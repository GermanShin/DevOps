package com.ds.hello;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HelloServiceApplicationTests {

    @Autowired
    MockMvc mockMvc;

    @Test
    @DisplayName("GET /actuator/health returns 200 UP")
    void healthCheck() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("GET /hello returns Hello World")
    void helloEndpoint() throws Exception {
        mockMvc.perform(get("/hello"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello World"))
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    @DisplayName("GET /db returns connected status")
    void dbEndpoint() throws Exception {
        mockMvc.perform(get("/db"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("connected"));
    }
}
