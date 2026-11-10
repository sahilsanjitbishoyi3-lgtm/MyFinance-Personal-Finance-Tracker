(() => {
  "use strict";

  const STORAGE_KEY = "myfinance_data_v1";

  const expenseCategories = [
    "Food", "Transport", "Shopping", "Bills",
    "Entertainment", "Health", "Education",
    "Travel", "Rent", "Other"
  ];

  const incomeCategories = [
    "Salary", "Business", "Freelance",
    "Gift", "Investment", "Other"
  ];

  const $ = id => document.getElementById(id);

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthNow = () => todayISO().slice(0, 7);

  const money = value =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(Number(value) || 0);

  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const safeText = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  // LOAD DATA AND MIGRATE OLD EXPENSE TRACKER RECORDS

  const loadData = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = JSON.parse(raw || "{}");

      let transactions = Array.isArray(saved.transactions)
        ? saved.transactions
        : [];

      // Import previous tracker records once, if available.
      if (!raw) {
        try {
          const legacy = JSON.parse(
            localStorage.getItem("expenses") || "[]"
          );

          if (Array.isArray(legacy)) {
            transactions = legacy.map(item => ({
              id: String(item.id || item.expenseId || uid()),
              type: "expense",
              description: String(
                item.description ||
                item.name ||
                item.expenseName ||
                "Previous expense"
              ),
              amount: Number(
                item.amount || item.expenseAmount || 0
              ),
              date: String(item.date || todayISO()).slice(0, 10),
              category: String(item.category || "Other"),
              payment: String(
                item.payment ||
                item.paymentMethod ||
                "Cash"
              ),
              recurring: false,
              recurringTemplate: false
            })).filter(item => item.amount > 0);
          }
        } catch (error) {
          console.warn("Old records could not be imported.", error);
        }
      }

      return {
        transactions,
        budgets: saved.budgets || {},
        goals: Array.isArray(saved.goals) ? saved.goals : []
      };

    } catch (error) {
      console.error("Could not load saved data:", error);

      return {
        transactions: [],
        budgets: {},
        goals: []
      };
    }
  };

  let data = loadData();

  let cashflowChart = null;
  let categoryChart = null;

  const transactionModal =
    new bootstrap.Modal($("transactionModal"));

  const budgetModal =
    new bootstrap.Modal($("budgetModal"));

  const goalModal =
    new bootstrap.Modal($("goalModal"));

  const toast =
    new bootstrap.Toast($("appToast"), { delay: 2600 });

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const notify = message => {
    $("toastMessage").textContent = message;
    toast.show();
  };

  let selectedMonth = monthNow();

  // CATEGORY OPTIONS

  function fillCategories(type, selected) {
    const list = type === "income"
      ? incomeCategories
      : expenseCategories;

    $("category").innerHTML = list.map(category =>
      `<option ${category === selected ? "selected" : ""}>${category}</option>`
    ).join("");
  }

  // MONTHLY TRANSACTIONS

  function currentMonthTransactions() {
    return data.transactions.filter(transaction =>
      String(transaction.date || "").slice(0, 7) === selectedMonth
    );
  }

  function totals(items) {
    return items.reduce((result, transaction) => {
      if (transaction.type === "income") {
        result.income += Number(transaction.amount);
      } else {
        result.expense += Number(transaction.amount);
      }

      return result;
    }, {
      income: 0,
      expense: 0
    });
  }

  // MAIN DASHBOARD

  function render() {
    const items = currentMonthTransactions();
    const sums = totals(items);

    const budget = Number(data.budgets[selectedMonth] || 0);
    const remaining = budget - sums.expense;

    $("monthLabel").textContent =
      new Date(selectedMonth + "-02").toLocaleDateString(
        "en-IN",
        { month: "long", year: "numeric" }
      );

    $("netBalance").textContent =
      money(sums.income - sums.expense);

    $("totalIncome").textContent =
      money(sums.income);

    $("totalExpense").textContent =
      money(sums.expense);

    $("remainingBudget").textContent =
      budget ? money(remaining) : "—";

    $("budgetFoot").textContent =
      budget
        ? (remaining >= 0 ? "Available to spend" : "Over budget")
        : "Set a monthly budget";

    $("budgetSpent").textContent =
      money(sums.expense);

    $("budgetLimitText").textContent =
      budget ? `of ${money(budget)} budget` : "Budget not set";

    $("budgetRemainingText").textContent =
      budget
        ? (remaining >= 0
            ? `${money(remaining)} left`
            : `${money(Math.abs(remaining))} over`)
        : "—";

    const percentage = budget
      ? Math.min(100, (sums.expense / budget) * 100)
      : 0;

    $("budgetPercent").textContent =
      budget ? `${Math.round(percentage)}%` : "0%";

    $("budgetProgress").style.width =
      percentage + "%";

    $("budgetProgress").classList.toggle(
      "over",
      budget > 0 && sums.expense > budget
    );

    $("budgetTip").textContent =
      !budget
        ? "Set a monthly budget to keep your spending on track."
        : sums.expense > budget
          ? "You have crossed your monthly budget. Review your spending."
          : remaining < budget * 0.2
            ? "You're getting close to your budget limit."
            : "Nice work — your spending is within budget.";

    renderTransactions(items);
    renderGoals();
    renderCharts(items);
  }

  // TRANSACTION TABLE

  function renderTransactions(items) {
    const query = $("searchInput").value.trim().toLowerCase();
    const type = $("typeFilter").value;
    const category = $("categoryFilter").value;
    const payment = $("paymentFilter").value;

    const filtered = items.filter(transaction => {
      const matchesSearch =
        !query ||
        `${transaction.description} ${transaction.category}`
          .toLowerCase()
          .includes(query);

      const matchesType =
        type === "all" || transaction.type === type;

      const matchesCategory =
        category === "all" || transaction.category === category;

      const matchesPayment =
        payment === "all" || transaction.payment === payment;

      return matchesSearch &&
        matchesType &&
        matchesCategory &&
        matchesPayment;

    }).sort((a, b) => b.date.localeCompare(a.date));

    $("transactionRows").innerHTML = filtered.map(transaction => `
      <tr>
        <td>
          <div class="transaction-name">
            ${safeText(transaction.description)}
          </div>
          ${transaction.recurring
            ? '<span class="recurring-tag">↻ Monthly</span>'
            : ""}
        </td>

        <td>
          ${new Date(transaction.date + "T00:00:00")
            .toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            })}
        </td>

        <td>
          <span class="category-pill">
            ${safeText(transaction.category)}
          </span>
        </td>

        <td>${safeText(transaction.payment)}</td>

        <td>
          <span class="type-pill ${transaction.type}">
            ${transaction.type === "income" ? "Income" : "Expense"}
          </span>
        </td>

        <td class="text-end amount-cell ${transaction.type}">
          ${transaction.type === "income" ? "+" : "−"}${money(transaction.amount)}
        </td>

        <td class="actions-cell">
          <button class="icon-btn"
            data-edit="${safeText(transaction.id)}"
            aria-label="Edit transaction">✎</button>

          <button class="icon-btn delete-btn"
            data-delete="${safeText(transaction.id)}"
            aria-label="Delete transaction">×</button>
        </td>
      </tr>
    `).join("");

    $("emptyTransactions").style.display =
      filtered.length ? "none" : "block";

    const categories = [
      ...new Set(items.map(transaction => transaction.category))
    ].sort();

    const oldCategory = category;

    $("categoryFilter").innerHTML =
      '<option value="all">All categories</option>' +
      categories.map(category =>
        `<option>${safeText(category)}</option>`
      ).join("");

    $("categoryFilter").value =
      categories.includes(oldCategory) ? oldCategory : "all";
  }

  // SAVINGS GOALS

  function renderGoals() {
    $("goalsList").innerHTML = data.goals.length
      ? data.goals.map(goal => {
          const percentage = Math.min(
            100,
            Number(goal.saved) / Number(goal.target) * 100
          );

          return `
            <div class="goal-item">
              <div class="goal-line">
                <strong>${safeText(goal.name)}</strong>
                <button class="icon-btn delete-btn"
                  data-goal-delete="${safeText(goal.id)}"
                  aria-label="Delete goal">×</button>
              </div>

              <div class="goal-amounts">
                <span>${money(goal.saved)} saved</span>
                <span>Target ${money(goal.target)}</span>
              </div>

              <div class="progress-track goal-progress">
                <div class="progress-fill"
                  style="width:${percentage}%"></div>
              </div>

              <div class="goal-percent">
                ${Math.round(percentage)}% completed
              </div>
            </div>
          `;
        }).join("")
      : '<div class="empty-state">Create a goal and make progress one step at a time.</div>';
  }

  // CHARTS

  function renderCharts(items) {
    const days = Array.from(
      { length: 31 },
      (_, index) => String(index + 1)
    );

    const income = days.map(day =>
      items
        .filter(t =>
          t.type === "income" &&
          Number(t.date.slice(8, 10)) === Number(day)
        )
        .reduce((sum, t) => sum + Number(t.amount), 0)
    );

    const expenses = days.map(day =>
      items
        .filter(t =>
          t.type === "expense" &&
          Number(t.date.slice(8, 10)) === Number(day)
        )
        .reduce((sum, t) => sum + Number(t.amount), 0)
    );

    if (cashflowChart) {
      cashflowChart.destroy();
    }

    cashflowChart = new Chart($("cashflowChart"), {
      type: "line",

      data: {
        labels: days,

        datasets: [
          {
            label: "Income",
            data: income,
            borderColor: "#16a47b",
            backgroundColor: "rgba(22,164,123,.08)",
            fill: true,
            tension: .35,
            pointRadius: 0
          },
          {
            label: "Expenses",
            data: expenses,
            borderColor: "#ef6b68",
            backgroundColor: "rgba(239,107,104,.05)",
            fill: true,
            tension: .35,
            pointRadius: 0
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: { display: false }
        },

        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 8 }
          },

          y: {
            beginAtZero: true,
            grid: { color: "#eef1f5" },
            ticks: {
              callback: value => "₹" + value
            }
          }
        }
      }
    });

    const categoryMap = {};

    items
      .filter(t => t.type === "expense")
      .forEach(t => {
        categoryMap[t.category] =
          (categoryMap[t.category] || 0) + Number(t.amount);
      });

    const labels = Object.keys(categoryMap);
    const values = Object.values(categoryMap);

    const chartColors = [
      "#6d70dc",
      "#22a987",
      "#f2b65e",
      "#ef7773",
      "#5c9edb",
      "#a78bce",
      "#63b9bf",
      "#e39b73",
      "#8c9baa",
      "#c2a3a0"
    ];

    if (categoryChart) {
      categoryChart.destroy();
    }

    categoryChart = new Chart($("categoryChart"), {
      type: "doughnut",

      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: chartColors,
          borderWidth: 3,
          borderColor: "#fff"
        }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false }
        }
      }
    });

    $("categoryLegend").innerHTML = labels.length
      ? labels.map((label, index) => `
          <span>
            <i style="background:${chartColors[index % chartColors.length]}"></i>
            ${safeText(label)}
            <b>${money(values[index])}</b>
          </span>
        `).join("")
      : '<span class="muted">No expenses to display yet.</span>';
  }

  // ADD TRANSACTION

  function openNew() {
    $("transactionForm").reset();
    $("transactionId").value = "";
    $("date").value = todayISO();

    $("transactionModalTitle").textContent = "Add transaction";

    document.querySelector(
      'input[name="transactionType"][value="expense"]'
    ).checked = true;

    fillCategories("expense");
    transactionModal.show();
  }

  // EDIT TRANSACTION

  function openEdit(id) {
    const transaction =
      data.transactions.find(item => item.id === id);

    if (!transaction) return;

    $("transactionForm").reset();

    $("transactionId").value = transaction.id;
    $("description").value = transaction.description;
    $("amount").value = transaction.amount;
    $("date").value = transaction.date;

    document.querySelector(
      `input[name="transactionType"][value="${transaction.type}"]`
    ).checked = true;

    fillCategories(transaction.type, transaction.category);

    $("paymentMethod").value = transaction.payment;
    $("recurring").checked = !!transaction.recurring;

    $("transactionModalTitle").textContent = "Edit transaction";

    transactionModal.show();
  }

  // AUTOMATIC MONTHLY RECURRING TRANSACTIONS

  function applyRecurring() {
    const now = monthNow();
    const monthDate = new Date(now + "-01T00:00:00");

    const templates = data.transactions.filter(
      transaction =>
        transaction.recurring &&
        transaction.recurringTemplate
    );

    templates.forEach(transaction => {
      const start = new Date(transaction.date + "T00:00:00");

      for (
        let date = new Date(
          start.getFullYear(),
          start.getMonth() + 1,
          1
        );
        date <= monthDate;
        date.setMonth(date.getMonth() + 1)
      ) {
        const key =
          `${transaction.id}-${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;

        const alreadyExists = data.transactions.some(
          item => item.recurringKey === key
        );

        if (!alreadyExists) {
          const day = Math.min(
            start.getDate(),
            new Date(
              date.getFullYear(),
              date.getMonth() + 1,
              0
            ).getDate()
          );

          data.transactions.push({
            ...transaction,

            id: uid(),

            date:
              `${date.getFullYear()}-${String(
                date.getMonth() + 1
              ).padStart(2, "0")}-${String(day).padStart(2, "0")}`,

            recurringKey: key,
            recurringTemplate: false
          });
        }
      }
    });

    if (templates.length) {
      save();
    }
  }

  // SAVE TRANSACTION

  $("transactionForm").addEventListener("submit", event => {
    event.preventDefault();

    const type = document.querySelector(
      'input[name="transactionType"]:checked'
    ).value;

    const id = $("transactionId").value;

    const record = {
      id: id || uid(),
      type,

      description: $("description").value.trim(),

      amount: Number($("amount").value),

      date: $("date").value,

      category: $("category").value,

      payment: $("paymentMethod").value,

      recurring: $("recurring").checked,

      recurringTemplate: $("recurring").checked
    };

    if (
      !record.description ||
      !Number.isFinite(record.amount) ||
      record.amount <= 0 ||
      !record.date
    ) {
      notify("Please enter valid transaction details.");
      return;
    }

    if (id) {
      const index = data.transactions.findIndex(
        transaction => transaction.id === id
      );

      if (index >= 0) {
        data.transactions[index] = {
          ...data.transactions[index],
          ...record,
          recurringKey: undefined
        };
      }
    } else {
      data.transactions.push(record);
    }

    save();

    transactionModal.hide();

    render();

    notify(id ? "Transaction updated" : "Transaction saved");
  });

  // CHANGE EXPENSE / INCOME CATEGORY

  document.querySelectorAll(
    'input[name="transactionType"]'
  ).forEach(radio => {
    radio.addEventListener("change", () => {
      fillCategories(radio.value);
    });
  });

  // DELETE AND EDIT TRANSACTIONS

  $("transactionRows").addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      openEdit(editButton.dataset.edit);
    }

    if (deleteButton && confirm("Delete this transaction?")) {
      data.transactions = data.transactions.filter(
        transaction =>
          transaction.id !== deleteButton.dataset.delete
      );

      save();
      render();

      notify("Transaction deleted");
    }
  });

  // DELETE SAVINGS GOALS

  $("goalsList").addEventListener("click", event => {
    const button = event.target.closest("[data-goal-delete]");

    if (
      button &&
      confirm("Delete this savings goal?")
    ) {
      data.goals = data.goals.filter(
        goal => goal.id !== button.dataset.goalDelete
      );

      save();
      renderGoals();

      notify("Goal deleted");
    }
  });

  // BUTTONS

  $("openAddBtn").addEventListener("click", openNew);
  $("openAddBtn2").addEventListener("click", openNew);

  // MONTH SELECTOR

  $("monthPicker").value = selectedMonth;

  $("monthPicker").addEventListener("change", event => {
    if (event.target.value) {
      selectedMonth = event.target.value;
      render();
    }
  });

  // SEARCH AND FILTERS

  ["searchInput", "typeFilter", "categoryFilter", "paymentFilter"]
    .forEach(id => {
      $(id).addEventListener(
        id === "searchInput" ? "input" : "change",
        () => renderTransactions(currentMonthTransactions())
      );
    });

  // MONTHLY BUDGET

  $("editBudgetBtn").addEventListener("click", () => {
    $("budgetAmount").value =
      data.budgets[selectedMonth] || "";

    budgetModal.show();
  });

  $("budgetForm").addEventListener("submit", event => {
    event.preventDefault();

    data.budgets[selectedMonth] =
      Number($("budgetAmount").value);

    save();

    budgetModal.hide();
    render();

    notify("Monthly budget saved");
  });

  // SAVINGS GOALS

  $("addGoalBtn").addEventListener("click", () => {
    $("goalForm").reset();
    goalModal.show();
  });

  $("goalForm").addEventListener("submit", event => {
    event.preventDefault();

    const target = Number($("goalTarget").value);
    const saved = Number($("goalSaved").value);

    if (target <= 0 || saved < 0) {
      notify("Enter valid goal amounts.");
      return;
    }

    data.goals.push({
      id: uid(),
      name: $("goalName").value.trim(),
      target,
      saved
    });

    save();

    goalModal.hide();
    renderGoals();

    notify("Savings goal added");
  });

  // EXCEL EXPORT HELPERS

  function rowsFor(items) {
    return items.map(transaction => [
      transaction.date,
      transaction.description,
      transaction.type,
      transaction.category,
      transaction.payment,
      Number(transaction.amount)
    ]);
  }

  // MONTHLY EXCEL EXPORT

  function exportMonthly() {
    if (!window.XLSX) {
      notify("Excel library did not load. Check your internet connection.");
      return;
    }

    const items = currentMonthTransactions();
    const sums = totals(items);

    const workbook = XLSX.utils.book_new();

    const summary = [
      ["MyFinance — Monthly Report"],
      ["Month", selectedMonth],
      ["Income", sums.income],
      ["Expenses", sums.expense],
      ["Net balance", sums.income - sums.expense],
      ["Budget", Number(data.budgets[selectedMonth] || 0)],
      [],
      [
        "Date",
        "Description",
        "Type",
        "Category",
        "Payment method",
        "Amount (INR)"
      ],
      ...rowsFor(items)
    ];

    const sheet = XLSX.utils.aoa_to_sheet(summary);

    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      "Monthly"
    );

    XLSX.writeFile(
      workbook,
      `MyFinance-${selectedMonth}.xlsx`
    );
  }

  // YEARLY EXCEL WITH 12 MONTHLY SHEETS

  function exportYearly() {
    if (!window.XLSX) {
      notify("Excel library did not load. Check your internet connection.");
      return;
    }

    const year = selectedMonth.slice(0, 4);

    const workbook = XLSX.utils.book_new();

    const summary = [[
      "Month",
      "Income (INR)",
      "Expenses (INR)",
      "Net balance (INR)",
      "Budget (INR)"
    ]];

    for (let monthNumber = 1; monthNumber <= 12; monthNumber++) {
      const month =
        `${year}-${String(monthNumber).padStart(2, "0")}`;

      const items = data.transactions.filter(
        transaction => transaction.date.startsWith(month)
      );

      const sums = totals(items);

      summary.push([
        month,
        sums.income,
        sums.expense,
        sums.income - sums.expense,
        Number(data.budgets[month] || 0)
      ]);

      const sheetData = [
        [
          "Date",
          "Description",
          "Type",
          "Category",
          "Payment method",
          "Amount (INR)"
        ],
        ...rowsFor(items)
      ];

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);

      const sheetName = new Date(
        month + "-02"
      ).toLocaleDateString("en-IN", {
        month: "short"
      });

      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        sheetName
      );
    }

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(summary),
      "Year summary"
    );

    XLSX.writeFile(
      workbook,
      `MyFinance-${year}-yearly.xlsx`
    );
  }

  // MONTHLY PDF REPORT

  function exportPDF() {
    if (!window.jspdf) {
      notify("PDF library did not load. Check your internet connection.");
      return;
    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF();

    const items = currentMonthTransactions();
    const sums = totals(items);

    doc.setFontSize(19);

    doc.text(
      "MyFinance — Monthly Report",
      14,
      18
    );

    doc.setFontSize(10);

    doc.text(
      `Month: ${selectedMonth}`,
      14,
      27
    );

    doc.text(
      `Income: ${money(sums.income)}    Expenses: ${money(sums.expense)}    Net: ${money(sums.income - sums.expense)}`,
      14,
      35
    );

    doc.autoTable({
      startY: 43,

      head: [[
        "Date",
        "Description",
        "Type",
        "Category",
        "Payment",
        "Amount (INR)"
      ]],

      body: rowsFor(items).map(row => [
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        money(row[5])
      ]),

      styles: {
        fontSize: 8
      },

      headStyles: {
        fillColor: [48, 58, 91]
      }
    });

    doc.save(`MyFinance-${selectedMonth}.pdf`);
  }

  // JSON BACKUP

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    link.click();

    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    downloadBlob(
      blob,
      `MyFinance-backup-${todayISO()}.json`
    );
  }

  // EXPORT BUTTONS

  $("monthlyExcelBtn").addEventListener(
    "click",
    exportMonthly
  );

  $("yearlyExcelBtn").addEventListener(
    "click",
    exportYearly
  );

  $("pdfBtn").addEventListener(
    "click",
    exportPDF
  );

  $("backupBtn").addEventListener(
    "click",
    exportBackup
  );

  // INITIALIZE APPLICATION

  applyRecurring();

  fillCategories("expense");

  render();

})();
